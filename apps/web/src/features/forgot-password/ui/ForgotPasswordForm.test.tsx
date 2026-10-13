import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { apiError, apiUrl } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('ForgotPasswordForm', () => {
  const ask = async (
    user: ReturnType<typeof renderApp>['user'],
    email: string,
  ) => {
    await user.type(screen.getByLabelText('Email'), email);
    await user.click(screen.getByRole('button', { name: 'Отправить ссылку' }));
  };

  it('sends the normalized address and promises a letter without confirming the account exists', async () => {
    let sentBody: unknown;
    server.use(
      http.post(apiUrl('/auth/password/forgot'), async ({ request }) => {
        sentBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp('/forgot-password');

    await ask(user, '  User@Example.COM ');

    // "If the address is registered": the API answers the same either way,
    // so the page must not claim an account exists.
    expect(await screen.findByText(/уже в пути/)).toBeInTheDocument();
    expect(screen.getByText('user@example.com')).toBeInTheDocument();
    expect(sentBody).toEqual({ email: 'user@example.com' });
  });

  it('shows the throttling error instead of a false promise', async () => {
    server.use(
      http.post(apiUrl('/auth/password/forgot'), () =>
        apiError(429, 'RATE_LIMITED', 'Too many requests'),
      ),
    );
    const { user } = renderApp('/forgot-password');

    await ask(user, 'user@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Слишком много попыток',
    );
    expect(screen.queryByText(/уже в пути/)).not.toBeInTheDocument();
  });
});
