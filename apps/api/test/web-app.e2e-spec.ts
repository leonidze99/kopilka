import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app.js';

describe('Web app on the same origin (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;

  beforeAll(async () => {
    // A stand-in for apps/web/dist.
    dir = await mkdtemp(join(tmpdir(), 'kopilka-web-'));
    await mkdir(join(dir, 'assets'));
    await writeFile(
      join(dir, 'index.html'),
      '<!doctype html><title>app</title>',
    );
    await writeFile(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
    await writeFile(join(dir, 'favicon.svg'), '<svg/>');
    app = await createTestApp({ webDistDir: dir });
  });

  afterAll(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });

  const http = () => request(app.getHttpServer());
  const page = (path: string) => http().get(path).set('Accept', 'text/html');

  it.each(['/', '/categories', '/login'])(
    'answers the page %s with index.html, always revalidated',
    async (path) => {
      const res = await page(path).expect(200).expect('Content-Type', /html/);

      expect(res.text).toContain('<title>app</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
      // helmet runs first: pages get the security headers too.
      expect(res.headers['content-security-policy']).toBeDefined();
    },
  );

  it('caches hashed assets for good', async () => {
    const res = await http().get('/assets/index-abc123.js').expect(200);

    expect(res.headers['cache-control']).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('serves other files without the long cache', async () => {
    const res = await http().get('/favicon.svg').expect(200);

    expect(res.headers['cache-control']).not.toContain('immutable');
  });

  it('answers a missing file with 404, not with the page', async () => {
    await page('/assets/missing.js').expect(404);
  });

  it('leaves /api to the API, even for a browser', async () => {
    const missing = await page('/api/no-such-route').expect(404);
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND' });

    await page('/api/health/live').expect(200).expect('Content-Type', /json/);
  });
});
