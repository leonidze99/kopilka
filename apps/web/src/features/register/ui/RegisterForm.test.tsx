import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { apiError, apiUrl, authResponse, USER } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('RegisterForm', () => {
  it('applies the password policy from the shared schema', async () => {
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Пароль'), 'short');
    await user.click(
      screen.getByRole('button', { name: 'Зарегистрироваться' }),
    );

    expect(
      await screen.findByText('Пароль должен быть не короче 8 символов'),
    ).toBeInTheDocument();
  });

  it('puts a server error about a field under that field', async () => {
    server.use(
      http.post(apiUrl('/auth/register'), () =>
        apiError(409, 'CONFLICT', 'Email is already registered', [
          { field: 'email', message: 'Email уже зарегистрирован' },
        ]),
      ),
    );
    const { user } = renderApp('/register');

    await user.type(screen.getByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Пароль'), 'secret-password');
    await user.click(
      screen.getByRole('button', { name: 'Зарегистрироваться' }),
    );

    const email = screen.getByLabelText('Email');
    expect(
      await screen.findByText('Email уже зарегистрирован'),
    ).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Email уже зарегистрирован');
  });

  it('signs the new user in', async () => {
    server.use(
      http.post(apiUrl('/auth/register'), () =>
        HttpResponse.json(authResponse(), { status: 201 }),
      ),
      http.get(apiUrl('/auth/me'), () => HttpResponse.json(USER)),
    );
    const { user, router } = renderApp('/register');

    await user.type(screen.getByLabelText('Email'), USER.email);
    await user.type(screen.getByLabelText('Пароль'), 'secret-password');
    await user.click(
      screen.getByRole('button', { name: 'Зарегистрироваться' }),
    );

    expect(
      await screen.findByText(`Вы вошли как ${USER.email}`),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
