import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Tx } from '../accounts/accounts.service.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ClientInfo } from './refresh-token.service.js';
import { describeUserAgent } from './user-agent.js';

/** The cookie a browser is known by; sent to the auth routes only. */
export const DEVICE_COOKIE = 'device_id';

/** As long as browsers keep a cookie (Chrome caps it at 400 days). */
export const DEVICE_COOKIE_DAYS = 400;

/** 32 random bytes in base64url: what the cookie holds when we made it. */
const TOKEN = /^[\w-]{43}$/;

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export interface Recognized {
  /** To put back into the cookie: its age starts again with every sign-in. */
  token: string;
  /** First time this user signs in from it. */
  isNew: boolean;
}

/**
 * Which browsers a user has signed in from. The cookie identifies the
 * browser, not the user: on a shared computer the same cookie becomes known
 * to each user who signs in there, with a row of their own.
 */
@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * After a successful sign-in. `known`: the device has nothing to tell
   * about (it is the one that registered the account). A cookie that is
   * not ours (wrong shape) is replaced; a valid one from another user's
   * sign-in is kept, and becomes known to this user too.
   */
  async recognize(
    userId: string,
    presented: string | undefined,
    client: ClientInfo,
    { known = false, tx }: { known?: boolean; tx?: Tx } = {},
  ): Promise<Recognized> {
    const db = tx ?? this.prisma;
    const token =
      presented && TOKEN.test(presented)
        ? presented
        : randomBytes(32).toString('base64url');
    const tokenHash = hash(token);
    const now = new Date();

    const { count } = await db.knownDevice.updateMany({
      where: { userId, tokenHash },
      data: { lastSeenAt: now },
    });
    if (count > 0) return { token, isNew: false };

    try {
      await db.knownDevice.create({
        data: {
          userId,
          tokenHash,
          device: describeUserAgent(client.userAgent).slice(0, 100),
          ip: client.ip?.slice(0, 45) ?? null,
          notifiedAt: known ? now : null,
        },
      });
      return { token, isNew: !known };
    } catch (error) {
      // The same browser signed in twice at once: the other request made
      // the row, and that one is the new device.
      if (isPrismaError(error, PrismaCode.UniqueViolation)) {
        return { token, isNew: false };
      }
      throw error;
    }
  }
}
