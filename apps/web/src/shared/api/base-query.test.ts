import { http, HttpResponse } from 'msw';
import { makeStore } from '@/app/store/store';
import { sessionApi } from '@/entities/session';
import { apiError, apiUrl, authResponse, USER } from '@/test/api';
import { server } from '@/test/server';
import { REFRESH_LOCK } from './base-query';

const signedInStore = (accessToken = 'expired-token') =>
  makeStore({
    session: { status: 'authenticated', accessToken, user: USER },
  });

/** /auth/me that accepts only the given access token. */
const meAccepting = (token: string) =>
  http.get(apiUrl('/auth/me'), ({ request }) =>
    request.headers.get('Authorization') === `Bearer ${token}`
      ? HttpResponse.json(USER)
      : apiError(401, 'UNAUTHORIZED', 'Invalid or expired access token'),
  );

describe('baseQueryWithReauth', () => {
  it('renews an expired access token and retries the request', async () => {
    const refresh = vi.fn(() => HttpResponse.json(authResponse('fresh-token')));
    server.use(
      meAccepting('fresh-token'),
      http.post(apiUrl('/auth/refresh'), refresh),
    );
    const store = signedInStore();

    const result = await store.dispatch(sessionApi.endpoints.me.initiate());

    expect(result.data).toEqual(USER);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(store.getState().session.accessToken).toBe('fresh-token');
  });

  it('ends the session when the refresh cookie is rejected', async () => {
    server.use(
      meAccepting('never'),
      http.post(apiUrl('/auth/refresh'), () =>
        apiError(401, 'UNAUTHORIZED', 'Invalid or expired refresh token'),
      ),
    );
    const store = signedInStore();

    const result = await store.dispatch(sessionApi.endpoints.me.initiate());

    expect(result.error).toMatchObject({ status: 401 });
    expect(store.getState().session).toMatchObject({
      status: 'anonymous',
      accessToken: null,
    });
  });

  it('makes one refresh request for concurrent callers in a tab', async () => {
    // Sending the same refresh token twice would look like theft to the API.
    const refresh = vi.fn(() => HttpResponse.json(authResponse('fresh-token')));
    server.use(http.post(apiUrl('/auth/refresh'), refresh));
    const store = makeStore();

    await Promise.all([
      store.dispatch(sessionApi.endpoints.restoreSession.initiate()),
      store.dispatch(sessionApi.endpoints.restoreSession.initiate()),
      store.dispatch(sessionApi.endpoints.restoreSession.initiate()),
    ]);

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('holds a Web Lock while refreshing, so tabs take turns', async () => {
    const request = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    Object.defineProperty(navigator, 'locks', {
      value: { request },
      configurable: true,
    });
    server.use(
      http.post(apiUrl('/auth/refresh'), () =>
        HttpResponse.json(authResponse()),
      ),
    );

    try {
      await makeStore().dispatch(
        sessionApi.endpoints.restoreSession.initiate(),
      );
      expect(request).toHaveBeenCalledWith(REFRESH_LOCK, expect.any(Function));
    } finally {
      Reflect.deleteProperty(navigator, 'locks');
    }
  });

  it('sends an X-Request-ID with every request', async () => {
    let requestId: string | null = null;
    server.use(
      http.get(apiUrl('/auth/me'), ({ request }) => {
        requestId = request.headers.get('X-Request-ID');
        return HttpResponse.json(USER);
      }),
    );

    await signedInStore('valid').dispatch(sessionApi.endpoints.me.initiate());

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
