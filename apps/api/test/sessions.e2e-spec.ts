import type { NestExpressApplication } from '@nestjs/platform-express';
import { authResponseSchema, authSessionListSchema } from '@kopilka/shared';
import request from 'supertest';
import { SessionsService } from '../src/auth/sessions.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

const PASSWORD = 'correct horse battery';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

describe('Sessions (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Another device: a login with its own User-Agent. */
  async function signIn(
    user: TestUser,
    userAgent = SAFARI_IPHONE,
    password = PASSWORD,
  ) {
    const res = await http()
      .post('/api/auth/login')
      .set('User-Agent', userAgent)
      .send({ email: user.email, password })
      .expect(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('refresh_token='))
      ?.split(';')[0];
    return {
      auth: `Bearer ${authResponseSchema.parse(res.body).accessToken}`,
      cookie: cookie ?? '',
    };
  }

  const sessions = async (auth: string) =>
    authSessionListSchema.parse(
      (
        await http()
          .get('/api/auth/sessions')
          .set('Authorization', auth)
          .expect(200)
      ).body,
    );

  const works = (auth: string) =>
    http().get('/api/auth/me').set('Authorization', auth);

  it('lists the signed-in devices, this one first', async () => {
    const user = await users.signUp();
    const laptop = await signIn(user, CHROME_WINDOWS);
    await signIn(user, SAFARI_IPHONE);

    const list = await sessions(laptop.auth);

    // Registration, the laptop and the phone.
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ device: 'Chrome, Windows', current: true });
    expect(list.filter((s) => s.current)).toHaveLength(1);
    expect(list.map((s) => s.device)).toContain('Safari, iPhone');
    expect(list[0]?.ip).toMatch(/127\.0\.0\.1|::1/);
  });

  it('ends a session at once: its access token too, not in 15 minutes', async () => {
    const user = await users.signUp();
    const laptop = await signIn(user, CHROME_WINDOWS);
    const phone = await signIn(user, SAFARI_IPHONE);
    const phoneSession = (await sessions(phone.auth)).find((s) => s.current);

    await http()
      .delete(`/api/auth/sessions/${phoneSession?.id}`)
      .set('Authorization', laptop.auth)
      .expect(204);

    await works(phone.auth)
      .expect(401)
      .expect(({ body }) => expect(body.message).toBe('Session has ended'));
    // Its refresh token is dead too, and that is not taken for theft.
    await http()
      .post('/api/auth/refresh')
      .set('Cookie', phone.cookie)
      .expect(401);
    await works(laptop.auth).expect(200);
    expect((await sessions(laptop.auth)).map((s) => s.device)).not.toContain(
      'Safari, iPhone',
    );
  });

  it('signs out everywhere else', async () => {
    const user = await users.signUp();
    const laptop = await signIn(user, CHROME_WINDOWS);
    const phone = await signIn(user);

    await http()
      .delete('/api/auth/sessions')
      .set('Authorization', laptop.auth)
      .expect(204);

    await works(phone.auth).expect(401);
    await works(user.auth).expect(401);
    await works(laptop.auth).expect(200);
    expect(await sessions(laptop.auth)).toEqual([
      expect.objectContaining({ current: true, device: 'Chrome, Windows' }),
    ]);
  });

  it("does not let a user end another user's session", async () => {
    const alice = await users.signUp();
    const bob = await users.signUp();
    const [bobSession] = await sessions(bob.auth);

    await http()
      .delete(`/api/auth/sessions/${bobSession?.id}`)
      .set('Authorization', alice.auth)
      .expect(404);
    await works(bob.auth).expect(200);
  });

  it('ends the session on logout and on a stolen refresh token', async () => {
    const user = await users.signUp();
    const device = await signIn(user);
    await http()
      .post('/api/auth/logout')
      .set('Cookie', device.cookie)
      .expect(204);
    await works(device.auth).expect(401);

    const victim = await signIn(user);
    // The thief refreshes first; the victim's later attempt shows the reuse.
    await http()
      .post('/api/auth/refresh')
      .set('Cookie', victim.cookie)
      .expect(200);
    await http()
      .post('/api/auth/refresh')
      .set('Cookie', victim.cookie)
      .expect(401);
    await works(victim.auth).expect(401);
  });

  it('keeps the session through refreshes, and notes the activity', async () => {
    const user = await users.signUp();
    const device = await signIn(user);
    const [before] = (await sessions(device.auth)).filter((s) => s.current);

    const res = await http()
      .post('/api/auth/refresh')
      .set('Cookie', device.cookie)
      .set('User-Agent', CHROME_WINDOWS)
      .expect(200);
    const auth = `Bearer ${res.body.accessToken as string}`;

    const [after] = (await sessions(auth)).filter((s) => s.current);
    expect(after?.id).toBe(before?.id);
    expect(after?.device).toBe('Chrome, Windows');
    expect(after!.lastUsedAt.getTime()).toBeGreaterThan(
      before!.lastUsedAt.getTime(),
    );
  });

  describe('changing the password', () => {
    const change = (auth: string, body: object) =>
      http().post('/api/auth/password').set('Authorization', auth).send(body);

    it('needs the current password, and a new one', async () => {
      const user = await users.signUp();
      await change(user.auth, {
        currentPassword: 'wrong one',
        newPassword: 'brand new secret',
      })
        .expect(400)
        .expect(({ body }) =>
          expect(body.details).toEqual([
            { field: 'currentPassword', message: 'Неверный пароль' },
          ]),
        );
      await change(user.auth, {
        currentPassword: PASSWORD,
        newPassword: PASSWORD,
      })
        .expect(400)
        .expect(({ body }) =>
          expect(body.details[0].field).toBe('newPassword'),
        );
      await change(user.auth, {
        currentPassword: PASSWORD,
        newPassword: 'short',
      }).expect(400);
    });

    it('signs every other device out, keeps this one, and takes the new password', async () => {
      const user = await users.signUp();
      const phone = await signIn(user);

      await change(user.auth, {
        currentPassword: PASSWORD,
        newPassword: 'brand new secret',
      }).expect(204);

      await works(phone.auth).expect(401);
      await http()
        .post('/api/auth/refresh')
        .set('Cookie', phone.cookie)
        .expect(401);
      await works(user.auth).expect(200);
      await http()
        .post('/api/auth/login')
        .send({ email: user.email, password: PASSWORD })
        .expect(401);
      await signIn(user, CHROME_WINDOWS, 'brand new secret');
    });
  });

  it('cleans up ended sessions and expired tokens, keeping what catches theft', async () => {
    const user = await users.signUp();
    const kept = await signIn(user);
    const ended = await signIn(user);
    await http()
      .post('/api/auth/logout')
      .set('Cookie', ended.cookie)
      .expect(204);
    // A rotation: the used token stays until it expires.
    await http()
      .post('/api/auth/refresh')
      .set('Cookie', kept.cookie)
      .expect(200);
    const userRow = await prisma.user.findUniqueOrThrow({
      where: { email: user.email },
      select: { id: true },
    });
    const count = () =>
      Promise.all([
        prisma.session.count({ where: { userId: userRow.id } }),
        prisma.refreshToken.count({ where: { userId: userRow.id } }),
      ]);
    // Sessions: registration, kept, ended; tokens: 1 + 2 (kept rotated) + 1.
    expect(await count()).toEqual([3, 4]);

    await app.get(SessionsService).cleanup(new Date(), { userId: user.id });

    // The ended session and its token are gone; the used token of the live
    // session stays.
    expect(await count()).toEqual([2, 3]);

    // Thirty-one days later everything has expired.
    await app
      .get(SessionsService)
      .cleanup(new Date(Date.now() + 31 * 24 * 3600 * 1000), {
        userId: user.id,
      });
    expect(await count()).toEqual([0, 0]);
  });
});
