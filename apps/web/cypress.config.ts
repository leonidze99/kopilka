import { defineConfig } from 'cypress';

/**
 * Drives the real app against the real API: `pnpm dev` locally (Vite proxies
 * /api to the API, so it is one origin as in production), or the built app
 * served by the API process in CI, where CYPRESS_BASE_URL points at it.
 *
 * The specs sign up a user of their own and leave it in the database; the
 * emails end in @cypress.test, which no other suite uses.
 */
export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? 'http://localhost:5173',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: false,
    video: false,
    // Wide enough for the two-column layout with the form beside the list.
    viewportWidth: 1280,
    viewportHeight: 900,
  },
});
