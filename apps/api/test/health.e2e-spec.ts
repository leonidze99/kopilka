import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema } from '@kopilka/shared';
import request from 'supertest';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Health checks (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Throttling on: probes must be exempt from it.
    app = await createTestApp({ throttle: true });
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());

  it('reports liveness without checking dependencies', async () => {
    const res = await http().get('/api/health/live').expect(200);

    expect(res.body).toEqual({
      status: 'ok',
      info: {},
      error: {},
      details: {},
    });
  });

  it('reports readiness with the database status', async () => {
    const res = await http().get('/api/health/ready').expect(200);

    expect(res.body).toMatchObject({
      status: 'ok',
      details: { database: { status: 'up' } },
    });
  });

  it('needs no access token and is not rate limited', async () => {
    const res = await http().get('/api/health/ready').expect(200);

    expect(res.headers['x-ratelimit-limit']).toBeUndefined();
  });

  describe('when the database is unavailable', () => {
    it('fails readiness with 503 but keeps liveness up', async () => {
      vi.spyOn(prisma, '$queryRaw').mockRejectedValue(
        new Error('connect ECONNREFUSED 127.0.0.1:5432'),
      );

      const ready = await http().get('/api/health/ready').expect(503);
      await http().get('/api/health/live').expect(200);

      // The reason goes to the logs, not to an anonymous caller.
      expect(apiErrorSchema.parse(ready.body)).toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service unavailable',
      });
      expect(JSON.stringify(ready.body)).not.toMatch(/ECONNREFUSED|5432/);
    });

    it('fails readiness fast when the database hangs', async () => {
      vi.spyOn(prisma, '$queryRaw').mockReturnValue(
        new Promise(() => {}) as never,
      );

      const started = Date.now();
      await http().get('/api/health/ready').expect(503);

      expect(Date.now() - started).toBeLessThan(2000);
    });
  });
});
