import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestUser {
  email: string;
  /** Ready-to-use `Authorization` header value. */
  auth: string;
}

/**
 * Signs up fresh users and later deletes exactly those. Test files run in
 * parallel against one database: deleting "all test users" in afterAll
 * would wipe the users of a suite that is still running.
 */
export function testUsers(app: INestApplication) {
  const emails: string[] = [];

  return {
    async signUp(): Promise<TestUser> {
      const email = `user-${randomUUID()}@kopilka-e2e.test`;
      emails.push(email);
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({ email, password: 'correct horse battery' })
        .expect(201);
      return { email, auth: `Bearer ${res.body.accessToken as string}` };
    },

    async cleanup(): Promise<void> {
      await app.get(PrismaService).user.deleteMany({
        where: { email: { in: emails } },
      });
    },
  };
}
