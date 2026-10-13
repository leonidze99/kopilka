import { INestApplication } from '@nestjs/common';
import { apiErrorSchema } from '@kopilka/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { MailerService } from './../src/mail/mailer.service.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { TEST_PASSWORD, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';
import { FakeMailer } from './utils/fake-mailer.js';

const NEW_PASSWORD = 'a brand new passphrase';

describe('Password reset (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailer: FakeMailer;
  let users: ReturnType<typeof testUsers>;

  beforeAll(async () => {
    mailer = new FakeMailer();
    // Nothing leaves the process; the test reads the link out of the mailer.
    app = await createTestApp({
      overrides: [{ provide: MailerService, useValue: mailer }],
    });
    prisma = app.get(PrismaService);
    users = testUsers(app);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const forgot = (email: string) =>
    http().post('/api/auth/password/forgot').send({ email });

  const reset = (token: string, newPassword = NEW_PASSWORD) =>
    http().post('/api/auth/password/reset').send({ token, newPassword });

  const login = (email: string, password: string) =>
    http().post('/api/auth/login').send({ email, password });

  /** Asks for a link and returns the token out of the mail. */
  const linkFor = async (email: string) => {
    await forgot(email).expect(204);
    return mailer.tokenFor(email);
  };

  it('mails a one-time link that changes the password and ends every session', async () => {
    const user = await users.signUp();
    const token = await linkFor(user.email);

    // The session from registration is alive until the reset.
    await http()
      .get('/api/auth/me')
      .set('Authorization', user.auth)
      .expect(200);

    await reset(token).expect(204);

    // Every session ends: whoever is signed in with the old password is out.
    await http()
      .get('/api/auth/me')
      .set('Authorization', user.auth)
      .expect(401);
    await login(user.email, TEST_PASSWORD).expect(401);
    await login(user.email, NEW_PASSWORD).expect(200);

    // Single use: the same link does nothing a second time.
    const spent = await reset(token, 'yet another passphrase').expect(400);
    expect(apiErrorSchema.parse(spent.body).code).toBe('INVALID_RESET_TOKEN');
  });

  it('answers an address nobody uses the same way, and mails nothing', async () => {
    const stranger = `nobody-${randomUUID()}@kopilka-e2e.test`;

    await forgot(stranger).expect(204);

    expect(mailer.to(stranger)).toHaveLength(0);
  });

  it('refuses an expired link', async () => {
    const user = await users.signUp();
    const token = await linkFor(user.email);

    // An hour into the past instead of waiting an hour.
    await prisma.passwordReset.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await reset(token).expect(400);
    expect(apiErrorSchema.parse(expired.body).code).toBe('INVALID_RESET_TOKEN');
    await login(user.email, TEST_PASSWORD).expect(200);
  });

  it('keeps only the newest link alive', async () => {
    const user = await users.signUp();
    const first = await linkFor(user.email);

    // Past the one-a-minute spacing, so the second request goes through.
    await prisma.passwordReset.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 120_000) },
    });
    const second = await linkFor(user.email);
    expect(second).not.toBe(first);

    await reset(first).expect(400);
    await reset(second).expect(204);
  });

  it('does not mail a second link within a minute', async () => {
    const user = await users.signUp();

    await forgot(user.email).expect(204);
    await forgot(user.email).expect(204);

    // The form mails an address its sender need not own: without the
    // spacing it would be a way to flood someone else's inbox.
    expect(mailer.to(user.email)).toHaveLength(1);
  });

  it('opens an account locked by someone guessing passwords', async () => {
    const user = await users.signUp();
    for (let i = 0; i < 10; i++) {
      await login(user.email, 'wrong password');
    }
    await login(user.email, TEST_PASSWORD).expect(429);

    await reset(await linkFor(user.email)).expect(204);

    await login(user.email, NEW_PASSWORD).expect(200);
  });
});
