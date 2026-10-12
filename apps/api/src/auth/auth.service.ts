import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthResponse,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  User,
} from '@kopilka/shared';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
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

const userSelect = { id: true, email: true } as const;

const unauthorized = (message: string) =>
  new AppException('UNAUTHORIZED', message, HttpStatus.UNAUTHORIZED);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTtlSeconds: number;

  // Verified against when the email is unknown, so that a login attempt
  // for a nonexistent user takes as long as one with a wrong password
  // and response time does not reveal which emails are registered.
  private readonly dummyHash = hash(randomBytes(16).toString('hex'));

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', {
      infer: true,
    });
  }

  async register(
    { email, password }: RegisterDto,
    client: ClientInfo,
  ): Promise<Session> {
    const passwordHash = await hash(password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            passwordHash,
            // Every transaction needs an account: a new user starts with one.
            accounts: { create: { name: 'Основной счёт', type: 'card' } },
          },
          select: userSelect,
        });
        return this.session(
          user,
          await this.refreshTokens.issue(user.id, client, tx),
        );
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

  async login(
    { email, password }: LoginDto,
    client: ClientInfo,
  ): Promise<Session> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user
      ? await verify(user.passwordHash, password)
      : await verify(await this.dummyHash, password).then(() => false);

    if (!user || !valid) {
      // One message for both cases: do not reveal which emails exist.
      throw new AppException(
        'INVALID_CREDENTIALS',
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }
    return this.session(user, await this.refreshTokens.issue(user.id, client));
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
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      return this.refreshTokens.end(tx, { userId, id: { not: sessionId } });
    });
    this.logger.log({ userId, endedSessions }, 'Password changed');
    return { endedSessions };
  }

  async me(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    // The access token outlives a deleted account by up to its TTL.
    if (!user) throw unauthorized('User no longer exists');
    return user;
  }

  private async session(
    user: User,
    refreshToken: IssuedRefreshToken,
  ): Promise<Session> {
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
