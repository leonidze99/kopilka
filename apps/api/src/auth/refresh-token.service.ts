import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
  /** The session it keeps alive; goes into the access token as sid. */
  sessionId: string;
}

/** Who is signing in, as the request tells: shown in the session list. */
export interface ClientInfo {
  userAgent: string | null;
  ip: string | null;
}

export type RotationResult =
  | { status: 'rotated'; userId: string; refreshToken: IssuedRefreshToken }
  | { status: 'reused'; userId: string; sessionId: string }
  | { status: 'invalid' };

type Db = Prisma.TransactionClient;

// The token carries 256 bits of entropy, so it cannot be guessed: a fast
// SHA-256 is enough to store it (unlike a password) and lets us look it up.
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/** Column sizes: a header is whatever the client sends. */
const clientColumns = ({ userAgent, ip }: ClientInfo) => ({
  userAgent: userAgent?.slice(0, 512) ?? null,
  ip: ip?.slice(0, 64) ?? null,
});

@Injectable()
export class RefreshTokenService {
  private readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs =
      config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 24 * 3600 * 1000;
  }

  /** Starts a session (login, registration) and its first token. */
  async issue(
    userId: string,
    client: ClientInfo,
    db: Db = this.prisma,
  ): Promise<IssuedRefreshToken> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const session = await db.session.create({
      data: { userId, ...clientColumns(client), lastUsedAt: now, expiresAt },
      select: { id: true },
    });
    return this.create(db, userId, session.id, expiresAt);
  }

  /**
   * Exchanges a refresh token for a new one in the same session.
   * A token can be exchanged once; presenting it again means it leaked,
   * so the whole session is ended.
   */
  rotate(presented: string, client: ClientInfo): Promise<RotationResult> {
    const now = new Date();

    // One transaction: consuming the old token and issuing the new one
    // either both happen or neither does.
    return this.prisma.$transaction(async (tx): Promise<RotationResult> => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(presented) },
        include: { session: { select: { revokedAt: true } } },
      });
      // An ended session: its tokens are dead, but presenting one is not
      // theft (a device signed out from elsewhere refreshes as usual).
      if (!current || current.session.revokedAt) return { status: 'invalid' };

      // Compare-and-set. UPDATE locks the row and re-checks the WHERE
      // clause after any concurrent writer commits, so of two requests
      // with the same token only one gets count === 1, at any isolation
      // level. A separate "SELECT, then UPDATE" would let both through.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });

      if (count === 0) {
        if (current.expiresAt <= now) return { status: 'invalid' };
        // Already used: earlier, or by a concurrent request just now.
        await this.end(tx, { id: current.familyId }, now);
        return {
          status: 'reused',
          userId: current.userId,
          sessionId: current.familyId,
        };
      }

      const expiresAt = new Date(now.getTime() + this.ttlMs);
      await tx.session.update({
        where: { id: current.familyId },
        data: { ...clientColumns(client), lastUsedAt: now, expiresAt },
      });
      return {
        status: 'rotated',
        userId: current.userId,
        refreshToken: await this.create(
          tx,
          current.userId,
          current.familyId,
          expiresAt,
        ),
      };
    });
  }

  /** Ends the session the token belongs to. Unknown tokens are ignored. */
  async revokeSessionOf(presented: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      select: { familyId: true },
    });
    if (current) await this.end(this.prisma, { id: current.familyId });
  }

  /**
   * Ends the sessions matching `where` that are still going; how many.
   * The guard reads revoked_at on every request: the access tokens of an
   * ended session stop working at once.
   */
  async end(
    db: Db,
    where: Prisma.SessionWhereInput,
    now = new Date(),
  ): Promise<number> {
    const { count } = await db.session.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: now },
    });
    return count;
  }

  private async create(
    db: Db,
    userId: string,
    sessionId: string,
    expiresAt: Date,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    await db.refreshToken.create({
      data: {
        userId,
        familyId: sessionId,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    return { token, expiresAt, sessionId };
  }
}
