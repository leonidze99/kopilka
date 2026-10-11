import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module.js';
import { setupApp } from '../../src/app.setup.js';
import { serveWebApp } from '../../src/web-app.js';

interface TestAppOptions {
  /** Extra controllers, e.g. ones that throw specific errors. */
  controllers?: Type[];
  /**
   * Rate limiting is off by default: every test request comes from the
   * same IP and suites would trip the auth limits. Turn it on in tests
   * that are about throttling.
   */
  throttle?: boolean;
  /** Serve a built web app from this directory, as WEB_DIST_DIR does. */
  webDistDir?: string;
}

/** The production app (AppModule + setupApp), silent and ready for supertest. */
export async function createTestApp({
  controllers = [],
  throttle = false,
  webDistDir,
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule], controllers });
  if (!throttle) {
    builder = builder
      .overrideProvider(ThrottlerGuard)
      .useValue({ canActivate: () => true });
  }

  const app = (
    await builder.compile()
  ).createNestApplication<NestExpressApplication>({ logger: false });
  setupApp(app);
  // The env is read once at import time; pass the directory directly.
  if (webDistDir) serveWebApp(app, webDistDir);
  await app.init();
  return app;
}
