/**
 * The API is on the same origin under /api: in production the API process
 * serves this app, in development Vite proxies /api to it. Absolute, so it
 * also works where fetch needs a full URL (Node in tests).
 */
export const API_URL =
  import.meta.env.VITE_API_URL ?? new URL('/api', window.location.origin).href;
