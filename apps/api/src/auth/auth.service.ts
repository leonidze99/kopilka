import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  AuthResponse,
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
  type IssuedRefreshToken,
  RefreshTokenService,
} from './refresh-token.service.js';

export interface AccessTokenPayload {
  sub: string;
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

  async register({ email, password }: RegisterDto): Promise<Session> {
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
        return this.session(user, await this.refreshTokens.issue(user.id, tx));
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

  async login({ email, password }: LoginDto): Promise<Session> {
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
    return this.session(user, await this.refreshTokens.issue(user.id));
  }

  async refresh(presented: string | undefined): Promise<Session> {
    if (!presented) throw unauthorized('Missing refresh token');

    const result = await this.refreshTokens.rotate(presented);
    if (result.status === 'reused') {
      this.logger.warn({
        msg: 'Refresh token reuse detected, session revoked',
        userId: result.userId,
        familyId: result.familyId,
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
    if (presented) await this.refreshTokens.revokeFamily(presented);
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
    const payload: AccessTokenPayload = { sub: user.id };
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
