import {
  type BaseQueryApi,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
  fetchBaseQuery,
} from '@reduxjs/toolkit/query/react';
import { API_URL } from '@/shared/config/env';
import {
  sessionEnded,
  sessionStarted,
  type StateWithAccessToken,
} from './session-events';
import type { ApiPath, Schemas } from './types';

type AuthResponse = Schemas['AuthResponse'];

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  // Sends the httpOnly refresh_token cookie (Path=/auth) cross-origin.
  credentials: 'include',
  prepareHeaders: (headers, { getState }) => {
    const { accessToken } = (getState() as StateWithAccessToken).session;
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    // The API reuses it as the request id: one id in browser and server logs.
    headers.set('X-Request-ID', crypto.randomUUID());
    return headers;
  },
});

// 401 here means wrong credentials or a dead session, not an expired
// access token: refreshing and retrying would be pointless.
const NO_REFRESH_PATHS = new Set<ApiPath>([
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
]);

const urlOf = (args: string | FetchArgs) =>
  typeof args === 'string' ? args : args.url;

export const REFRESH_LOCK = 'kopilka:refresh-session';

// Runs fn under a lock shared by all tabs of the origin. Without it, two
// tabs refreshing at once send the same refresh token, the API sees a
// rotated token presented twice, treats it as theft and ends the session.
// Under the lock the second tab sends the cookie the first one rotated.
const withCrossTabLock = <T>(fn: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(REFRESH_LOCK, fn)
    : fn();

let inFlightRefresh: Promise<AuthResponse | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Concurrent callers
 * in a tab share one request (e.g. several queries hitting 401 at once).
 * Resolves to null and ends the session if the cookie no longer works.
 */
export function refreshSession(
  api: BaseQueryApi,
  extraOptions: object = {},
): Promise<AuthResponse | null> {
  inFlightRefresh ??= withCrossTabLock(async () => {
    const result = await rawBaseQuery(
      { url: '/auth/refresh' satisfies ApiPath, method: 'POST' },
      api,
      extraOptions,
    );
    if (result.data) {
      const session = result.data as AuthResponse;
      api.dispatch(sessionStarted(session));
      return session;
    }
    api.dispatch(sessionEnded());
    return null;
  }).finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

/** fetchBaseQuery that renews an expired access token once and retries. */
export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (
    result.error?.status !== 401 ||
    NO_REFRESH_PATHS.has(urlOf(args) as ApiPath)
  ) {
    return result;
  }

  const session = await refreshSession(api, extraOptions);
  // prepareHeaders picks up the new access token from the store.
  return session ? rawBaseQuery(args, api, extraOptions) : result;
};
