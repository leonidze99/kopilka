import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Comma-separated origins allowed to call the API from a browser.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(
          // abort: a value that is not a URL skips the origin check below.
          z.url({ abort: true }).refine(
            // Zod 4 runs refinements after a failed check unless it aborts;
            // guard the parse anyway so the schema can never throw.
            (url) => URL.canParse(url) && new URL(url).origin === url,
            'Expected an origin like https://app.example.com, without a path or trailing slash',
          ),
        )
        .min(1),
    ),
  // How many reverse proxies (load balancer, PaaS router) sit in front of
  // the app. req.ip is taken from X-Forwarded-For that many hops from the
  // right. 0 = no proxy, X-Forwarded-For is ignored. Never "trust all":
  // a client could then put any IP into the header and dodge rate limits.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  // HS256 key: a short secret can be brute-forced offline from any token.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  // Account lockout (see auth/login-lock.ts). Failed sign-ins in a row that
  // lock an account, and the first lock in minutes (it doubles with each
  // further failure, up to an hour). The throttler's per-IP limit stays.
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).default(10),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(5),
  // The built web app (apps/web/dist) to serve from this process; the
  // Docker image sets it. Unset: API only, as in development.
  WEB_DIST_DIR: z.string().min(1).optional(),
  // Background jobs (recurring payments, imports). Off in e2e tests: a tick in the
  // middle of a test would make its data change under it; tests run the
  // jobs by hand with a clock of their own.
  JOBS_ENABLED: z.stringbool().default(true),
  // Defaults per NODE_ENV live in the logger config (debug / silent / info).
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
});

export type Env = z.infer<typeof envSchema>;

export type AppConfigService = ConfigService<Env, true>;
