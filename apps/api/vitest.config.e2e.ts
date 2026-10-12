import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { testDatabaseUrl } from './test/utils/test-database.js';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Creates and migrates the test database once.
    globalSetup: ['./test/global-setup.ts'],
    env: {
      // A database of their own, not the development one.
      DATABASE_URL: testDatabaseUrl(),
      // No cron ticks in the middle of a test: jobs run by hand there.
      JOBS_ENABLED: 'false',
    },
  },
});
