import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

describe('In production (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // The env is read when AppModule is loaded, so stub it first and
    // import the app afterwards.
    vi.stubEnv('NODE_ENV', 'production');
    const { createTestApp } = await import('./utils/create-test-app.js');
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('does not serve the API docs', async () => {
    await request(app.getHttpServer()).get('/docs').expect(404);
    await request(app.getHttpServer()).get('/docs/openapi.json').expect(404);
  });

  it('upgrades insecure requests in the CSP', async () => {
    const res = await request(app.getHttpServer()).get('/health/live');

    expect(res.headers['content-security-policy']).toMatch(
      /upgrade-insecure-requests/,
    );
  });
});
