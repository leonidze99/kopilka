import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Starts a Postgres container (or takes E2E_DATABASE_URL), applies the
    // migrations and puts the URL into DATABASE_URL for the test workers.
    globalSetup: ['./test/global-setup.ts'],
    env: {
      // No cron ticks in the middle of a test: jobs run by hand there.
      JOBS_ENABLED: 'false',
    },
    // Pulling and starting the container, then migrating, takes a while.
    hookTimeout: 120_000,
  },
});
