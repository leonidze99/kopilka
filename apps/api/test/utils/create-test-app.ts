import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module.js';
import { CbrClient } from '../../src/rates/cbr.client.js';
import { setupApp } from '../../src/app.setup.js';
import { serveWebApp } from '../../src/web-app.js';
import { FakeCbr } from './fake-cbr.js';

/** What overrideProvider() accepts: a class, a string or a symbol token. */
type ProviderToken = Parameters<TestingModuleBuilder['overrideProvider']>[0];

interface ProviderOverride {
  provide: ProviderToken;
  useValue: unknown;
}

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
  /**
   * Providers to replace, e.g. the mailer: a test needs to read the link
   * that would have been sent instead of letting it leave the process.
   * The Bank of Russia is always a FakeCbr unless one is given here: tests
   * never reach the network.
   */
  overrides?: ProviderOverride[];
}

/** The production app (AppModule + setupApp), silent and ready for supertest. */
export async function createTestApp({
  controllers = [],
  throttle = false,
  webDistDir,
  overrides = [],
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule], controllers });
  if (!overrides.some(({ provide }) => provide === CbrClient)) {
    builder = builder.overrideProvider(CbrClient).useValue(new FakeCbr());
  }
  for (const { provide, useValue } of overrides) {
    builder = builder.overrideProvider(provide).useValue(useValue);
  }
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
