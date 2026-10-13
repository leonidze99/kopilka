import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './utils/create-test-app.js';

const TOKEN = 'a-long-enough-scrape-token';

describe('Metrics (e2e)', () => {
  describe('without a token configured', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    const http = () => request(app.getHttpServer());

    it('counts requests by route pattern and reports the process', async () => {
      await http().get('/api/health/live').expect(200);

      const res = await http().get('/api/metrics').expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      // The pattern, not the URL: ids must not become labels.
      expect(res.text).toContain(
        'http_requests_total{method="GET",route="/api/health/live",status="200"}',
      );
      expect(res.text).toContain('http_request_duration_seconds_bucket');
      // Node's own numbers come with it.
      expect(res.text).toContain('nodejs_eventloop_lag_seconds');
    });

    it('puts every unmatched request into one series', async () => {
      await http().get(`/api/nothing-here-${Date.now()}`).expect(404);
      await http()
        .get(`/api/nothing-here-${Date.now() + 1}`)
        .expect(404);

      const res = await http().get('/api/metrics').expect(200);

      expect(res.text).toContain('route="unmatched"');
      expect(res.text).not.toContain('nothing-here');
    });
  });

  describe('with a token configured', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      process.env['METRICS_TOKEN'] = TOKEN;
      app = await createTestApp();
    });

    afterAll(async () => {
      delete process.env['METRICS_TOKEN'];
      await app.close();
    });

    const http = () => request(app.getHttpServer());

    it('answers 404 without the token, and the metrics with it', async () => {
      // 404, not 401: a scan should not learn the endpoint is there.
      await http().get('/api/metrics').expect(404);
      await http()
        .get('/api/metrics')
        .set('Authorization', 'Bearer not-the-right-token')
        .expect(404);

      const res = await http()
        .get('/api/metrics')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(200);
      expect(res.text).toContain('http_requests_total');
    });
  });
});
