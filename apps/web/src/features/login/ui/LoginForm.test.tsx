import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { apiError, apiUrl, authResponse, emptyAccount, USER } from '@/test/api';
import { expectOperationsPage, renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('LoginForm', () => {
  const fill = async (
    user: ReturnType<typeof renderApp>['user'],
    email: string,
    password: string,
  ) => {
    await user.type(screen.getByLabelText('Email'), email);
    await user.type(screen.getByLabelText('Пароль'), password);
    await user.click(screen.getByRole('button', { name: 'Войти' }));
  };

  it('validates on the client with the shared schema, without calling the API', async () => {
    const { user } = renderApp('/login');

    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Введите email')).toBeInTheDocument();
    expect(screen.getByText('Введите пароль')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('signs in and returns to the page the user was going to', async () => {
    let sentBody: unknown;
    server.use(
      http.post(apiUrl('/auth/login'), async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json(authResponse());
      }),
      ...emptyAccount(),
    );
    // A protected page: the guard sends an anonymous user to /login first.
    const { user, router } = renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Вход в Копилку' }),
    ).toBeInTheDocument();

    await fill(user, '  User@Example.COM ', 'secret-password');

    await expectOperationsPage();
    expect(router.state.location.pathname).toBe('/');
    // Normalized by the shared schema before sending.
    expect(sentBody).toEqual({
      email: 'user@example.com',
      password: 'secret-password',
    });
  });

  it('shows wrong credentials as a form error and does not try to refresh', async () => {
    // 401 here means wrong credentials, not an expired access token.
    const refresh = vi.fn(() => HttpResponse.json(authResponse()));
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
      ),
      http.post(apiUrl('/auth/refresh'), refresh),
    );
    const { user } = renderApp('/login');

    await fill(user, USER.email, 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Неверный email или пароль',
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it('shows how long a locked account has to wait', async () => {
    server.use(
      http.post(apiUrl('/auth/login'), () =>
        apiError(429, 'ACCOUNT_LOCKED', 'Too many failed sign-in attempts', [
          // No field: the API puts the wait in the message for the user,
          // because Retry-After is not readable from fetchBaseQuery.
          {
            message:
              'Слишком много неудачных попыток входа. Попробуйте через 5 мин.',
          },
        ]),
      ),
    );
    const { user } = renderApp('/login');

    await fill(user, USER.email, 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Попробуйте через 5 мин.',
    );
  });

  it('reports a network failure', async () => {
    server.use(http.post(apiUrl('/auth/login'), () => HttpResponse.error()));
    const { user } = renderApp('/login');

    await fill(user, USER.email, 'secret-password');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером',
    );
  });
});
