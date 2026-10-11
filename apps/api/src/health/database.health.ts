import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';

// A probe that hangs is as bad as a failing one: platforms give up on it
// after a few seconds anyway, so fail fast and report why.
const TIMEOUT_MS = 1000;

/**
 * Pings the database with SELECT 1. Terminus has a PrismaHealthIndicator,
 * but it first calls a MongoDB-only method and detects SQL databases by the
 * text of the resulting error, which is brittle across Prisma releases.
 */
@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthIndicatorService,
  ) {}

  check(key = 'database') {
    return this.health
      .check(key)
      .attempt(async () => {
        try {
          await this.prisma.$queryRaw`SELECT 1`;
        } catch (error) {
          // For connection failures Prisma's message is just "Invalid
          // `prisma.$queryRaw()` invocation:"; the driver code (ECONNREFUSED,
          // ETIMEDOUT, 28P01 = bad password, ...) is what an operator needs.
          const code = (error as { code?: unknown }).code;
          throw new Error(
            typeof code === 'string'
              ? `Database query failed: ${code}`
              : String(error),
            { cause: error },
          );
        }
      })
      .withTimeout(TIMEOUT_MS);
  }
}
