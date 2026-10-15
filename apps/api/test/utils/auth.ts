import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service.js';

/** The password every user created here signs in with. */
export const TEST_PASSWORD = 'correct horse battery';

export interface TestUser {
  id: string;
  email: string;
  /** Ready-to-use `Authorization` header value. */
  auth: string;
  /** The browser it registered from, as a `Cookie` header: device_id=… */
  device: string;
}

/**
 * Signs up fresh users and later deletes exactly those. Test files run in
 * parallel against one database: deleting "all test users" in afterAll
 * would wipe the users of a suite that is still running.
 */
export function testUsers(app: INestApplication) {
  const emails: string[] = [];

  return {
    /**
     * A registered user. Registration hands out default categories; they
     * are dropped here unless a test asks for them, so suites can create
     * categories of any name without running into one of the defaults.
     */
    async signUp({ keepDefaults = false } = {}): Promise<TestUser> {
      const email = `user-${randomUUID()}@kopilka-e2e.test`;
      emails.push(email);
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: TEST_PASSWORD })
        .expect(201);
      const id = res.body.user.id as string;
      if (!keepDefaults) {
        await app.get(PrismaService).category.deleteMany({
          where: { userId: id },
        });
      }
      const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      const device =
        cookies
          .find((cookie) => cookie.startsWith('device_id='))
          ?.split(';')[0] ?? '';
      return {
        id,
        email,
        auth: `Bearer ${res.body.accessToken as string}`,
        device,
      };
    },

    async cleanup(): Promise<void> {
      await app.get(PrismaService).user.deleteMany({
        where: { email: { in: emails } },
      });
    },
  };
}
