import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { REQUEST_ID_HEADER } from './common/logging/logger.config.js';
import type { AppConfigService } from './config/env.js';

/**
 * App-level setup that cannot live in a module (Express middleware that
 * must run before body parsing, CORS). Shared by main.ts and e2e tests,
 * so tests exercise the same application that runs in production.
 */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<AppConfigService>(ConfigService);

  // Affects req.ip, and with it rate limiting and logs.
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  // Security headers (nosniff, HSTS, frame-ancestors, ...) and no
  // X-Powered-By. Registered via app.use so they apply to every response,
  // including errors raised by body-parser before routing.
  app.use(helmet());

  app.enableCors({
    // An explicit list: with credentials the browser rejects "*" anyway.
    origin: config.get('CORS_ORIGINS', { infer: true }),
    // Lets the frontend send the refresh cookie with fetch(..., { credentials: 'include' }).
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER],
    // Response headers JavaScript may read; not on the CORS safelist by default.
    exposedHeaders: [REQUEST_ID_HEADER, 'Retry-After'],
    // Cache preflight responses for 10 minutes.
    maxAge: 600,
  });

  app.enableShutdownHooks();
}
