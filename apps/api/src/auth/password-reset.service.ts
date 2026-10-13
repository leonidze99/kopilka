import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ForgotPasswordDto, ResetPasswordDto } from '@kopilka/shared';
import { hash } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { type Mail, MailerService } from '../mail/mailer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NO_FAILURES } from './login-lock.js';
import { RefreshTokenService } from './refresh-token.service.js';

/** 256 bits of randomness: the link cannot be guessed. */
const TOKEN_BYTES = 32;

/**
 * At most one link a minute per account. The form mails an address the
 * requester does not have to own, so without this it is a way to flood
 * someone else's inbox.
 */
const RESEND_AFTER_MS = 60_000;

// Stored hashed, like refresh tokens: whoever reads the table cannot take
// an account over. The entropy above is why a fast hash is enough.
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const invalidToken = () =>
  new AppException(
    'INVALID_RESET_TOKEN',
    'Invalid or expired password reset token',
    HttpStatus.BAD_REQUEST,
    [{ message: 'Ссылка недействительна или устарела. Запросите новую.' }],
  );

function resetMail(to: string, link: string, minutes: number): Mail {
  const text = [
    'Вы запросили новый пароль в Копилке.',
    '',
    `Чтобы задать его, откройте ссылку (действует ${minutes} мин., сработает один раз):`,
    link,
    '',
    'Если пароль вы не теряли, просто удалите это письмо — он останется прежним.',
  ].join('\n');
  return {
    to,
    subject: 'Новый пароль в Копилке',
    text,
    html: `<p>Вы запросили новый пароль в Копилке.</p>
<p><a href="${link}">Задать новый пароль</a></p>
<p>Ссылка действует ${minutes} мин. и сработает один раз.</p>
<p>Если пароль вы не теряли, просто удалите это письмо — он останется прежним.</p>`,
  };
}

/**
 * "Forgot my password": a one-time link by email. The way back into an
 * account whose password is lost — and the way out of a lockout
 * (see login-lock.ts), which a stranger guessing passwords can cause.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly ttlMinutes: number;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly refreshTokens: RefreshTokenService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMinutes = config.get('PASSWORD_RESET_TTL_MINUTES', {
      infer: true,
    });
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /**
   * Mails a link, if the address belongs to an account. The endpoint answers
   * the same either way: "we sent it if you are registered" is the only way
   * not to turn the form into a list of registered addresses.
   */
  async request({ email }: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    if (!user) return;

    const now = new Date();
    const latest = await this.prisma.passwordReset.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (
      latest &&
      now.getTime() - latest.createdAt.getTime() < RESEND_AFTER_MS
    ) {
      this.logger.log({
        msg: 'Password reset link asked for again too soon, not sent',
        userId: user.id,
      });
      return;
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    await this.prisma.$transaction([
      // Only the newest link works: an earlier one, still sitting in a
      // forwarded copy or a shared mailbox, stops being a way in.
      this.prisma.passwordReset.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + this.ttlMinutes * 60_000),
        },
      }),
    ]);

    // The token travels in the URL, so it is never logged: pino would write
    // the query string of a request, but this link is only ever mailed.
    await this.mailer.send(
      resetMail(
        user.email,
        `${this.appUrl}/reset-password?token=${token}`,
        this.ttlMinutes,
      ),
    );
    this.logger.log({ msg: 'Password reset link sent', userId: user.id });
  }

  /**
   * Sets the new password for the owner of a live link and ends every
   * session of that account: a reset is the way back after a possible
   * takeover, so whoever is signed in with the old password is signed out.
   */
  async reset({ token, newPassword }: ResetPasswordDto): Promise<void> {
    const record = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });
    const now = new Date();
    if (!record || record.usedAt || record.expiresAt <= now) {
      throw invalidToken();
    }

    // argon2 takes tens of milliseconds of CPU: hashed before the
    // transaction, so no database connection waits for it.
    const passwordHash = await hash(newPassword);

    const endedSessions = await this.prisma.$transaction(async (tx) => {
      // Compare-and-set, as in refresh rotation: of two requests with the
      // same link, exactly one changes the password.
      const { count } = await tx.passwordReset.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 0) throw invalidToken();

      await tx.user.update({
        where: { id: record.userId },
        // Clears a lockout too: the account is back with its owner.
        data: { passwordHash, ...NO_FAILURES },
      });
      return this.refreshTokens.end(tx, { userId: record.userId }, now);
    });

    this.logger.log({
      msg: 'Password reset with an emailed link',
      userId: record.userId,
      endedSessions,
    });
  }
}
