import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { apiErrorSchema, authResponseSchema } from '@kopilka/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';

const EMAIL_DOMAIN = '@auth-e2e.test';
const PASSWORD = 'correct horse battery';

const newEmail = () => `user-${randomUUID()}${EMAIL_DOMAIN}`;

/** `refresh_token=<value>` from Set-Cookie, ready to send back. */
function refreshCookie(res: request.Response): string {
  const header = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = header?.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('no refresh_token cookie in response');
  return cookie.split(';')[0]!;
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { endsWith: EMAIL_DOMAIN } },
    });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const register = (email = newEmail()) =>
    http().post('/api/auth/register').send({ email, password: PASSWORD });

  describe('register', () => {
    it('creates a user, returns an access token and sets the refresh cookie', async () => {
      const res = await register(
        '  New.User' + EMAIL_DOMAIN.toUpperCase(),
      ).expect(201);

      const body = authResponseSchema.parse(res.body);
      expect(body.user.email).toBe('new.user' + EMAIL_DOMAIN);
      expect(body.expiresIn).toBe(900);
      expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

      const cookie = (res.headers['set-cookie'] as unknown as string[]).find(
        (c) => c.startsWith('refresh_token='),
      );
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/auth;/);
    });

    it('stores an argon2id hash, not the password', async () => {
      const email = newEmail();
      await register(email).expect(201);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect(user.passwordHash).not.toContain(PASSWORD);
    });

    it('rejects an email that differs only in case with CONFLICT on the field', async () => {
      const email = newEmail();
      await register(email).expect(201);

      const res = await register(email.toUpperCase()).expect(409);
      expect(apiErrorSchema.parse(res.body)).toMatchObject({
        code: 'CONFLICT',
        details: [{ field: 'email' }],
      });
    });

    it('validates email and password', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);

      expect(res.body.details.map((d: { field: string }) => d.field)).toEqual([
        'email',
        'password',
      ]);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials, with any email case', async () => {
      const email = newEmail();
      await register(email).expect(201);

      const res = await http()
        .post('/api/auth/login')
        .send({ email: email.toUpperCase(), password: PASSWORD })
        .expect(200);

      expect(authResponseSchema.parse(res.body).user.email).toBe(email);
      expect(refreshCookie(res)).toBeTruthy();
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const email = newEmail();
      await register(email).expect(201);

      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ email, password: 'wrong password' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/auth/login')
        .send({ email: newEmail(), password: PASSWORD })
        .expect(401);

      // toEqual ignores keys with undefined values.
      const strip = (body: Record<string, unknown>) => ({
        ...body,
        requestId: undefined,
      });
      expect(strip(wrongPassword.body)).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
      expect(strip(unknownEmail.body)).toEqual(strip(wrongPassword.body));
    });
  });

  describe('access token', () => {
    it('is required by default and resolves the current user', async () => {
      const { body } = await register().expect(201);

      await http().get('/api/auth/me').expect(401);
      const me = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);

      expect(me.body).toEqual(body.user);
    });

    it.each([
      [
        'expired',
        () =>
          app.get(JwtService).sign({ sub: randomUUID() }, { expiresIn: -10 }),
      ],
      [
        'signed with another key',
        () =>
          new JwtService({ secret: 'x'.repeat(32) }).sign({
            sub: randomUUID(),
          }),
      ],
      [
        'unsigned (alg: none)',
        () => {
          const part = (o: object) =>
            Buffer.from(JSON.stringify(o)).toString('base64url');
          return `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: randomUUID() })}.`;
        },
      ],
    ])('is rejected when %s', async (_case, makeToken) => {
      const res = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${makeToken()}`)
        .expect(401);

      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and issues a new access token', async () => {
      const cookie = refreshCookie(await register().expect(201));

      const res = await http()
        .post('/api/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);

      expect(authResponseSchema.parse(res.body).accessToken).toBeTruthy();
      expect(refreshCookie(res)).not.toBe(cookie);
    });

    it('revokes the whole session when a rotated token is presented again', async () => {
      const stolen = refreshCookie(await register().expect(201));
      const legit = refreshCookie(
        await http()
          .post('/api/auth/refresh')
          .set('Cookie', stolen)
          .expect(200),
      );

      // The attacker replays the old token: rejected, and the session dies...
      await http().post('/api/auth/refresh').set('Cookie', stolen).expect(401);
      // ...so the token the legitimate client holds stops working too.
      await http().post('/api/auth/refresh').set('Cookie', legit).expect(401);
    });

    it('lets exactly one of many concurrent requests with the same token through', async () => {
      const cookie = refreshCookie(await register().expect(201));

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          http().post('/api/auth/refresh').set('Cookie', cookie),
        ),
      );

      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.filter((s) => s === 401)).toHaveLength(9);
    });

    it('rejects a missing or unknown token and clears the cookie', async () => {
      await http().post('/api/auth/refresh').expect(401);

      const res = await http()
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=garbage')
        .expect(401);
      expect(res.headers['set-cookie']?.[0]).toMatch(/^refresh_token=;/);
    });
  });

  describe('logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const cookie = refreshCookie(await register().expect(201));

      const res = await http()
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      expect(res.headers['set-cookie']?.[0]).toMatch(/^refresh_token=;/);

      await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('is idempotent without a cookie', async () => {
      await http().post('/api/auth/logout').expect(204);
    });
  });
});
