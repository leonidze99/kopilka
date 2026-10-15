import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { AuthSession } from '@kopilka/shared';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DEVICE_COOKIE_DAYS } from './devices.service.js';
import { RefreshTokenService } from './refresh-token.service.js';
import { describeUserAgent } from './user-agent.js';

const notFound = () =>
  new AppException('NOT_FOUND', 'Session not found', HttpStatus.NOT_FOUND);

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  private readonly jobsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly refreshTokens: RefreshTokenService,
    config: ConfigService<Env, true>,
  ) {
    this.jobsEnabled = config.get('JOBS_ENABLED', { infer: true });
  }

  /**
   * For the guard, on every request: the session of an access token is
   * still going. One primary-key lookup: the price of "end a session" and
   * "change the password" working at once instead of in up to 15 minutes.
   */
  async isActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true },
    });
    return (
      !!session &&
      session.userId === userId &&
      session.revokedAt === null &&
      session.expiresAt > new Date()
    );
  }

  async list(userId: string, currentId: string): Promise<AuthSession[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ip: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
    return sessions
      .map(({ userAgent, ...session }) => ({
        ...session,
        device: describeUserAgent(userAgent),
        current: session.id === currentId,
      }))
      .sort((a, b) => Number(b.current) - Number(a.current));
  }

  /** Ends one session of the user: another device, or this one. */
  async revoke(userId: string, id: string): Promise<void> {
    const ended = await this.refreshTokens.end(this.prisma, { id, userId });
    if (ended === 0) {
      // Already ended is fine (a double click); someone else's is not found.
      const exists = await this.prisma.session.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) throw notFound();
    }
  }

  /** "Sign out everywhere else": every session but this one. */
  revokeOthers(userId: string, currentId: string): Promise<number> {
    return this.refreshTokens.end(this.prisma, {
      userId,
      id: { not: currentId },
    });
  }

  /**
   * Every refresh adds a row, so refresh_tokens only grows. Daily: drop
   * expired tokens, sessions that ended or expired (their tokens go with
   * them) and expired password reset links. Used but unexpired tokens of
   * live sessions stay: they are what catches a stolen token presented
   * again.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM, { name: 'sessions-cleanup' })
  async tick(): Promise<void> {
    if (!this.jobsEnabled) return;
    try {
      await this.cleanup(new Date());
    } catch (error) {
      this.logger.error(error, 'Sessions cleanup failed');
    }
  }

  /**
   * `now` is a parameter: tests move the clock. `scope.userId`: only that
   * user's rows, for tests sharing one database (as with the recurring
   * runner): a clock a month ahead would sign out every other suite.
   */
  async cleanup(now: Date, scope: { userId?: string } = {}): Promise<void> {
    const sessions = await this.prisma.session.deleteMany({
      where: {
        userId: scope.userId,
        OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }],
      },
    });
    const tokens = await this.prisma.refreshToken.deleteMany({
      where: { userId: scope.userId, expiresAt: { lte: now } },
    });
    // A used link stays until it expires: a second click on it then gets
    // "the link is dead" rather than nothing at all.
    const resets = await this.prisma.passwordReset.deleteMany({
      where: { userId: scope.userId, expiresAt: { lte: now } },
    });
    // A browser unseen for as long as its cookie lives is gone for good.
    const devices = await this.prisma.knownDevice.deleteMany({
      where: {
        userId: scope.userId,
        lastSeenAt: {
          lte: new Date(now.getTime() - DEVICE_COOKIE_DAYS * 86_400_000),
        },
      },
    });
    this.logger.log(
      {
        sessions: sessions.count,
        tokens: tokens.count,
        resets: resets.count,
        devices: devices.count,
      },
      'Ended sessions, expired refresh tokens, reset links and forgotten devices deleted',
    );
  }
}
