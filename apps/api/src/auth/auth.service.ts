import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthResponse,
  ChangePasswordDto,
  LoginDto,
  NotificationSettingsDto,
  RegisterDto,
  User,
  Currency,
} from '@kopilka/shared';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  activeLock,
  type LockPolicy,
  type LockState,
  NO_FAILURES,
  nextFailure,
  retryAfterSeconds,
} from './login-lock.js';
import { DevicesService } from './devices.service.js';
import { LoginAlertsService } from './login-alerts.service.js';
import {
  type ClientInfo,
  type IssuedRefreshToken,
  RefreshTokenService,
} from './refresh-token.service.js';

export interface AccessTokenPayload {
  sub: string;
  /** The session: JwtAuthGuard checks it is still going. */
  sid: string;
}

export interface Session {
  auth: AuthResponse;
  refreshToken: IssuedRefreshToken;
}

/** A sign-in: the session, and the browser's device_id cookie to set. */
export interface SignIn extends Session {
  deviceToken: string;
}

const userSelect = {
  id: true,
  email: true,
  budgetAlerts: true,
  recurringAlerts: true,
  loginAlerts: true,
  baseCurrency: true,
} as const;

/** A user row as the API shows it; the currency code is one the API wrote. */
const toUser = (row: {
  id: string;
  email: string;
  budgetAlerts: boolean;
  recurringAlerts: boolean;
  loginAlerts: boolean;
  baseCurrency: string;
}): User => ({
  id: row.id,
  email: row.email,
  budgetAlerts: row.budgetAlerts,
  recurringAlerts: row.recurringAlerts,
  loginAlerts: row.loginAlerts,
  baseCurrency: row.baseCurrency as Currency,
});

/**
 * Policy, not deployment settings, so they stay here while the limit and
 * the first lock are configurable: a failure an hour after the previous one
 * starts the count again, and an escalating lock never passes an hour.
 */
const FAILURE_WINDOW_MINUTES = 60;
const MAX_LOCK_MINUTES = 60;

/** The lock columns of the user row, as the raw SELECT returns them. */
interface LockRow {
  failed_login_attempts: number;
  last_failed_login_at: Date | null;
  locked_until: Date | null;
}

const unauthorized = (message: string) =>
  new AppException('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtlSeconds: number;
  private readonly lockPolicy: LockPolicy;

  // Verified against when the email is unknown, so that a login attempt
  // for a nonexistent user takes as long as one with a wrong password
  // and response time does not reveal which emails are registered.
  private readonly dummyHash = hash(randomBytes(16).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly devices: DevicesService,
    private readonly loginAlerts: LoginAlertsService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
    this.lockPolicy = {
      maxFailures: config.get('LOGIN_MAX_FAILURES', { infer: true }),
      lockMinutes: config.get('LOGIN_LOCK_MINUTES', { infer: true }),
      maxLockMinutes: MAX_LOCK_MINUTES,
      failureWindowMinutes: FAILURE_WINDOW_MINUTES,
    };
  }

  /** The browser that registers is known from the start: no letter. */
  async register(
    { email, password, timeZone }: RegisterDto,
    client: ClientInfo,
    deviceCookie?: string,
  ): Promise<SignIn> {
    const passwordHash = await hash(password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            timeZone,
            // Every transaction needs an account: a new user starts with one.
            accounts: { create: { name: 'Основной счёт', type: 'card' } },
            // ...and with categories to put transactions in, so the app is
            // usable before the user sets anything up.
            categories: { create: [...DEFAULT_CATEGORIES] },
          },
          select: userSelect,
        });
        const device = await this.devices.recognize(
          user.id,
          deviceCookie,
          client,
          { known: true, tx },
        );
        const session = await this.session(
          user,
          await this.refreshTokens.issue(user.id, client, tx),
        );
        return { ...session, deviceToken: device.token };
      });
    } catch (error) {
      // The unique index is the source of truth. Checking "is this email
      // free?" before inserting would race with a concurrent registration.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        error.meta?.modelName === 'User'
      ) {
        throw new AppException(
          'CONFLICT',
          'Email is already registered',
          HttpStatus.CONFLICT,
          [{ field: 'email', message: 'Email уже зарегистрирован' }],
        );
      }
      throw error;
    }
  }

  /**
   * A browser this user has not signed in from before gets a letter about
   * it, sent in the background: the sign-in neither waits nor fails for it.
   */
  async login(
    { email, password }: LoginDto,
    client: ClientInfo,
    deviceCookie?: string,
  ): Promise<SignIn> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const now = new Date();

    // A locked account is refused before argon2 runs, so guessing at one
    // costs the server nothing. The right password is refused as well, or
    // the lock would not stop the attack it exists for; the way back in for
    // the owner is a password reset, which clears the lock.
    const locked = user && activeLock(user, now);
    if (locked) throw this.lockedOut(locked, now);

    const valid = user
      ? await verify(user.passwordHash, password)
      : await verify(await this.dummyHash, password).then(() => false);

    if (!user || !valid) {
      // Counted only for an account that exists: a row per unknown address
      // would let anyone fill the table, and whether an address is
      // registered is already discoverable through registration.
      const lockedNow = user ? await this.countFailure(user.id, now) : null;
      if (lockedNow) throw this.lockedOut(lockedNow, now);
      // One message for both cases: do not reveal which emails exist.
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // The counter walks back to zero only on a correct password; writing on
    // every sign-in would add a row update nobody needs.
    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: NO_FAILURES,
      });
    }
    const session = await this.session(
      user,
      await this.refreshTokens.issue(user.id, client),
    );
    const device = await this.devices.recognize(user.id, deviceCookie, client);
    if (device.isNew) this.loginAlerts.kick();
    return { ...session, deviceToken: device.token };
  }

  /**
   * Records one failed attempt; returns when the account opens again if
   * this attempt locked it, null otherwise.
   *
   * Read and write under one `SELECT ... FOR UPDATE`: two attempts arriving
   * together would otherwise read the same count and the later write would
   * swallow the earlier one, so a burst of parallel guesses would count as
   * a single failure.
   */
  private countFailure(userId: string, now: Date): Promise<Date | null> {
    return this.prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<LockRow[]>`
        SELECT failed_login_attempts, last_failed_login_at, locked_until
        FROM users
        WHERE id = ${userId}::uuid
        FOR UPDATE
      `;
      // Gone: the account was deleted while the password was being verified.
      if (!row) return null;

      const current: LockState = {
        failedLoginAttempts: Number(row.failed_login_attempts),
        lastFailedLoginAt: row.last_failed_login_at,
        lockedUntil: row.locked_until,
      };
      // A parallel attempt locked it while this one was waiting for the row;
      // attempts during a lock do not extend it.
      const already = activeLock(current, now);
      if (already) return already;

      const next = nextFailure(current, now, this.lockPolicy);
      await tx.user.update({ where: { id: userId }, data: next });
      if (next.lockedUntil) {
        this.logger.warn({
          msg: 'Account locked after repeated failed sign-ins',
          userId,
          attempts: next.failedLoginAttempts,
          lockedUntil: next.lockedUntil,
        });
      }
      return next.lockedUntil;
    });
  }

  private lockedOut(lockedUntil: Date, now: Date): AppException {
    const seconds = retryAfterSeconds(lockedUntil, now);
    return new AppException(
      'ACCOUNT_LOCKED',
      'Too many failed sign-in attempts',
      HttpStatus.TOO_MANY_REQUESTS,
      // The frontend cannot read Retry-After (fetchBaseQuery drops response
      // headers), so the wait is in the message shown to the user too.
      [
        {
          message: `Слишком много неудачных попыток входа. Попробуйте через ${Math.ceil(seconds / 60)} мин.`,
        },
      ],
      { 'Retry-After': String(seconds) },
    );
  }

  async refresh(
    presented: string | undefined,
    client: ClientInfo,
  ): Promise<Session> {
    if (!presented) throw unauthorized('Missing refresh token');

    const result = await this.refreshTokens.rotate(presented, client);
    if (result.status === 'reused') {
      this.logger.warn({
        msg: 'Refresh token reuse detected, session revoked',
        userId: result.userId,
        sessionId: result.sessionId,
      });
    }
    if (result.status !== 'rotated') {
      throw unauthorized('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: result.userId },
      select: userSelect,
    });
    return this.session(user, result.refreshToken);
  }

  async logout(presented: string | undefined): Promise<void> {
    if (presented) await this.refreshTokens.revokeSessionOf(presented);
  }

  /**
   * Needs the current password even though the user is signed in: an
   * unattended unlocked device must not be enough to take the account.
   * Ends every other session in the same transaction: whoever learned the
   * old password is signed out with it. This session stays.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<{ endedSessions: number }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!(await verify(user.passwordHash, currentPassword))) {
      throw new AppException(
        'VALIDATION_FAILED',
        'Current password is wrong',
        HttpStatus.BAD_REQUEST,
        [{ field: 'currentPassword', message: 'Неверный пароль' }],
      );
    }
    // Hashed before the transaction: argon2 takes tens of milliseconds of
    // CPU, no reason to hold a connection meanwhile.
    const passwordHash = await hash(newPassword);
    const endedSessions = await this.prisma.$transaction(async (tx) => {
      // Whoever knows the current password owns the account: a lockout
      // left by someone guessing at it goes away with the change.
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, ...NO_FAILURES },
      });
      return this.refreshTokens.end(tx, { userId, id: { not: sessionId } });
    });
    this.logger.log({ userId, endedSessions }, 'Password changed');
    return { endedSessions };
  }

  /** Turns letters on or off: budgets, recurring payments, new devices. */
  async setNotifications(
    userId: string,
    { budgetAlerts, recurringAlerts, loginAlerts }: NotificationSettingsDto,
  ): Promise<User> {
    return toUser(
      await this.prisma.user.update({
        where: { id: userId },
        data: { budgetAlerts, recurringAlerts, loginAlerts },
        select: userSelect,
      }),
    );
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    // The access token outlives a deleted account by up to its TTL.
    if (!user) throw unauthorized('User no longer exists');
    return toUser(user);
  }

  private async session(
    row: Parameters<typeof toUser>[0],
    refreshToken: IssuedRefreshToken,
  ): Promise<Session> {
    const user = toUser(row);
    const payload: AccessTokenPayload = {
      sub: user.id,
      sid: refreshToken.sessionId,
    };
    return {
      auth: {
        accessToken: await this.jwt.signAsync(payload),
        expiresIn: this.accessTtlSeconds,
        user,
      },
      refreshToken,
    };
  }
}
