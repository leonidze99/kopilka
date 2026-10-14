import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // The same origin as in production, where the API serves the app:
      // the SameSite=Strict refresh cookie (Path=/api/auth) just works.
      proxy: {
        '/api': env.API_PROXY_TARGET ?? 'http://localhost:3000',
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // A test renders the app and waits for it several times (see the
      // asyncUtilTimeout in setup.ts): 5 s for all of it is too little on a
      // loaded machine.
      testTimeout: 15_000,
      // Generated API types, not tests.
      exclude: ['**/node_modules/**', 'src/shared/api/schema.d.ts'],
    },
  };
});
