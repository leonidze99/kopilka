import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { apiError, apiUrl, authResponse, emptyAccount } from '@/test/api';
import { expectOperationsPage, renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('App session flow', () => {
  it('restores the session from the refresh cookie after a reload', async () => {
    server.use(
      http.post(apiUrl('/auth/refresh'), () =>
        HttpResponse.json(authResponse()),
      ),
      ...emptyAccount(),
    );

    renderApp('/', { session: 'unknown' });

    expect(
      screen.getByRole('status', { name: 'Загрузка' }),
    ).toBeInTheDocument();
    await expectOperationsPage();
  });

  it('sends a visitor without a valid cookie to the login page', async () => {
    server.use(
      http.post(apiUrl('/auth/refresh'), () =>
        apiError(401, 'UNAUTHORIZED', 'Missing refresh token'),
      ),
    );

    const { router } = renderApp('/', { session: 'unknown' });

    expect(
      await screen.findByRole('heading', { name: 'Вход в Копилку' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('keeps a signed-in user away from the login page', async () => {
    server.use(...emptyAccount());

    const { router } = renderApp('/login', { session: 'authenticated' });

    await expectOperationsPage();
    expect(router.state.location.pathname).toBe('/');
  });

  it('logs out and returns to the login page', async () => {
    const logout = vi.fn(() => new HttpResponse(null, { status: 204 }));
    server.use(...emptyAccount(), http.post(apiUrl('/auth/logout'), logout));
    const { user, store } = renderApp('/', { session: 'authenticated' });

    await user.click(await screen.findByRole('button', { name: 'Выйти' }));

    expect(
      await screen.findByRole('heading', { name: 'Вход в Копилку' }),
    ).toBeInTheDocument();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(store.getState().session.status).toBe('anonymous');
  });
});
