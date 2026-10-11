import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface IssuedRefreshToken {
  token: string;
  expiresAt: Date;
}

export type RotationResult =
  | { status: 'rotated'; userId: string; refreshToken: IssuedRefreshToken }
  | { status: 'reused'; userId: string; familyId: string }
  | { status: 'invalid' };

type Db = Prisma.TransactionClient;

// The token carries 256 bits of entropy, so it cannot be guessed: a fast
// SHA-256 is enough to store it (unlike a password) and lets us look it up.
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

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

  /** Starts a new family, i.e. a new session (login, registration). */
  issue(userId: string, db: Db = this.prisma): Promise<IssuedRefreshToken> {
    return this.create(db, userId, randomUUID());
  }

  /**
   * Exchanges a refresh token for a new one in the same family.
   * A token can be exchanged once; presenting it again means it leaked,
   * so the whole family (the session) is revoked.
   */
  rotate(presented: string): Promise<RotationResult> {
    const now = new Date();

    // One transaction: consuming the old token and issuing the new one
    // either both happen or neither does.
    return this.prisma.$transaction(async (tx): Promise<RotationResult> => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: hashToken(presented) },
      });
      if (!current) return { status: 'invalid' };

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
        // Already consumed: earlier, or by a concurrent request just now.
        await tx.refreshToken.updateMany({
          where: { familyId: current.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        return {
          status: 'reused',
          userId: current.userId,
          familyId: current.familyId,
        };
      }

      return {
        status: 'rotated',
        userId: current.userId,
        refreshToken: await this.create(tx, current.userId, current.familyId),
      };
    });
  }

  /** Ends the session the token belongs to. Unknown tokens are ignored. */
  async revokeFamily(presented: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(presented) },
      select: { familyId: true },
    });
    if (!current) return;

    await this.prisma.refreshToken.updateMany({
      where: { familyId: current.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async create(
    db: Db,
    userId: string,
    familyId: string,
  ): Promise<IssuedRefreshToken> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.ttlMs);
    await db.refreshToken.create({
      data: { userId, familyId, tokenHash: hashToken(token), expiresAt },
    });
    return { token, expiresAt };
  }
}
