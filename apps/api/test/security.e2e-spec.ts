import { INestApplication } from '@nestjs/common';
import { apiErrorSchema } from '@kopilka/shared';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './utils/create-test-app.js';

const FRONTEND = 'http://localhost:5173';

describe('Security (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ throttle: true });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('helmet', () => {
    it('sets security headers and hides the framework', async () => {
      const res = await http().get('/api').expect(200);

      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['content-security-policy']).toBeDefined();
    });

    it('also covers errors raised by body-parser before routing', async () => {
      const res = await http()
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"broken": ')
        .expect(400);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    it('answers a preflight from the frontend origin, with credentials', async () => {
      const res = await http()
        .options('/api/auth/login')
        .set('Origin', FRONTEND)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type,x-request-id')
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(FRONTEND);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['access-control-allow-headers']).toMatch(
        /x-request-id/i,
      );
      expect(res.headers['access-control-max-age']).toBe('600');
    });

    it('lets the frontend read X-Request-ID and Retry-After', async () => {
      const res = await http().get('/api').set('Origin', FRONTEND).expect(200);

      expect(res.headers['access-control-expose-headers']).toBe(
        'X-Request-ID,Retry-After',
      );
    });

    it('does not allow other origins', async () => {
      const res = await http()
        .get('/api')
        .set('Origin', 'https://evil.example')
        .expect(200);

      // The server still answers; the browser hides the response from the
      // page because the allow-origin header is missing.
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    it('applies the global limit to ordinary routes', async () => {
      const res = await http().get('/api').expect(200);

      expect(res.headers['x-ratelimit-limit']).toBe('100');
    });

    it('ignores X-Forwarded-For when no proxy is trusted', async () => {
      const remaining = async (ip: string) =>
        Number(
          (await http().get('/api').set('X-Forwarded-For', ip).expect(200))
            .headers['x-ratelimit-remaining'],
        );

      // A client cannot get a fresh budget by inventing an IP.
      const first = await remaining('198.51.100.1');
      expect(await remaining('198.51.100.2')).toBe(first - 1);
    });

    it('blocks the 11th login attempt within a minute with RATE_LIMITED', async () => {
      const attempt = () =>
        http()
          .post('/api/auth/login')
          .send({ email: 'nobody@security-e2e.test', password: 'wrong' });

      // Requests rejected by body-parser (e.g. the malformed JSON in the
      // helmet test) never reach the guard and are not counted.
      for (let i = 0; i < 10; i++) await attempt().expect(401);

      const blocked = await attempt().expect(429);
      expect(apiErrorSchema.parse(blocked.body)).toMatchObject({
        code: 'RATE_LIMITED',
        message: 'Too many requests, try again later',
      });
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('counts register separately from login', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ email: 'not-an-email', password: 'x' })
        .expect(400);

      expect(res.headers['x-ratelimit-remaining']).toBe('9');
    });
  });
});
