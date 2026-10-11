import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

describe('Behind a trusted proxy (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // The env is read when AppModule is loaded, so stub it first and
    // import the app afterwards.
    vi.stubEnv('TRUST_PROXY_HOPS', '1');
    const { createTestApp } = await import('./utils/create-test-app.js');
    app = await createTestApp({ throttle: true });
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const remaining = async (forwardedFor: string) =>
    Number(
      (
        await request(app.getHttpServer())
          .get('/')
          .set('X-Forwarded-For', forwardedFor)
          .expect(200)
      ).headers['x-ratelimit-remaining'],
    );

  it('gives each client behind the proxy its own budget', async () => {
    expect(await remaining('203.0.113.1')).toBe(99);
    expect(await remaining('203.0.113.2')).toBe(99);
  });

  it('ignores addresses the client prepends to X-Forwarded-For', async () => {
    // The proxy appends the address it saw; only that last entry counts.
    const first = await remaining('198.51.100.1, 203.0.113.9');
    expect(await remaining('198.51.100.2, 203.0.113.9')).toBe(first - 1);
  });
});
