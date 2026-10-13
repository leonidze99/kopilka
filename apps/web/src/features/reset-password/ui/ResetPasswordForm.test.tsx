import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { apiError, apiUrl } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('ResetPasswordForm', () => {
  const fill = async (
    user: ReturnType<typeof renderApp>['user'],
    password: string,
  ) => {
    await user.type(screen.getByLabelText('Новый пароль'), password);
    await user.click(screen.getByRole('button', { name: 'Сохранить пароль' }));
  };

  it('sends the token from the link and then asks to sign in', async () => {
    let sentBody: unknown;
    server.use(
      http.post(apiUrl('/auth/password/reset'), async ({ request }) => {
        sentBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, router } = renderApp('/reset-password?token=link-token');

    await fill(user, 'a brand new passphrase');

    // The API ended every session, so the way in is the login form.
    expect(
      await screen.findByText(/войдите с новым паролем/),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(sentBody).toEqual({
      token: 'link-token',
      newPassword: 'a brand new passphrase',
    });
  });

  it('explains a dead link in the words the API sent', async () => {
    server.use(
      http.post(apiUrl('/auth/password/reset'), () =>
        apiError(
          400,
          'INVALID_RESET_TOKEN',
          'Invalid or expired password reset token',
          [
            {
              message: 'Ссылка недействительна или устарела. Запросите новую.',
            },
          ],
        ),
      ),
    );
    const { user, router } = renderApp('/reset-password?token=old-token');

    await fill(user, 'a brand new passphrase');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ссылка недействительна или устарела',
    );
    expect(router.state.location.pathname).toBe('/reset-password');
  });

  it('asks for a new link when the URL carries no token', async () => {
    renderApp('/reset-password');

    expect(screen.getByText(/В ссылке нет кода/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'запросите новую' }),
    ).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument();
  });
});
