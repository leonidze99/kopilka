import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Schemas } from '@/shared/api';
import { API_URL } from '@/shared/config/env';
import { mockAccount } from '@/test/account';
import { apiError, apiUrl } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

type AuthSession = Schemas['AuthSession'];

const THIS: AuthSession = {
  id: '0199d0a4-5555-7000-8000-000000000001',
  device: 'Chrome, Windows',
  ip: '127.0.0.1',
  createdAt: '2026-10-01T09:00:00.000Z',
  lastUsedAt: '2026-10-12T10:00:00.000Z',
  current: true,
};

const PHONE: AuthSession = {
  id: '0199d0a4-5555-7000-8000-000000000002',
  device: 'Safari, iPhone',
  ip: '10.0.0.7',
  createdAt: '2026-09-20T09:00:00.000Z',
  lastUsedAt: '2026-10-05T18:30:00.000Z',
  current: false,
};

/** The sessions API in memory: what was ended is gone from the next list. */
function mockSessions(sessions = [THIS, PHONE]) {
  let state = [...sessions];
  const sent = {
    ended: [] as string[],
    endedOthers: 0,
    passwords: [] as object[],
  };
  server.use(
    http.get(apiUrl('/auth/sessions'), () => HttpResponse.json(state)),
    http.delete(`${API_URL}/auth/sessions/:id`, ({ params }) => {
      sent.ended.push(String(params['id']));
      state = state.filter((s) => s.id !== params['id']);
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(apiUrl('/auth/sessions'), () => {
      sent.endedOthers++;
      state = state.filter((s) => s.current);
      return new HttpResponse(null, { status: 204 });
    }),
    http.post(apiUrl('/auth/password'), async ({ request }) => {
      const body = (await request.json()) as { currentPassword: string };
      sent.passwords.push(body);
      if (body.currentPassword !== 'old secret 1') {
        return apiError(400, 'VALIDATION_FAILED', 'Current password is wrong', [
          { field: 'currentPassword', message: 'Неверный пароль' },
        ]);
      }
      state = state.filter((s) => s.current);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return sent;
}

describe('SettingsPage', () => {
  it('is linked from the header', async () => {
    mockAccount();
    mockSessions();
    const { user, router } = renderApp('/accounts', {
      session: 'authenticated',
    });

    await user.click(
      await screen.findByRole('link', { name: 'Безопасность аккаунта' }),
    );

    expect(router.state.location.pathname).toBe('/settings');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Безопасность' }),
    ).toBeInTheDocument();
  });

  it('lists the devices, this one first, and signs another out', async () => {
    mockAccount();
    const sent = mockSessions();
    const { user } = renderApp('/settings', { session: 'authenticated' });

    const list = await screen.findByRole('list', { name: 'Активные сеансы' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(first).toHaveTextContent(
      /Chrome, Windows.*Это устройство.*Активен сейчас/,
    );
    expect(second).toHaveTextContent(
      /Safari, iPhone.*Был активен: .*IP 10\.0\.0\.7/,
    );
    // This device signs out from the header, not from here.
    expect(within(first!).queryByRole('button')).not.toBeInTheDocument();

    await user.click(
      within(second!).getByRole('button', {
        name: 'Завершить сеанс: Safari, iPhone',
      }),
    );

    expect(sent.ended).toEqual([PHONE.id]);
    expect(await screen.findByText('Сеанс завершён')).toBeInTheDocument();
    // Refetched after the toast: wait for it.
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')).toHaveLength(1),
    );
    // Nothing else to sign out of.
    expect(
      screen.queryByRole('button', {
        name: 'Выйти на всех других устройствах',
      }),
    ).not.toBeInTheDocument();
  });

  it('signs out everywhere else at once', async () => {
    mockAccount();
    const sent = mockSessions();
    const { user } = renderApp('/settings', { session: 'authenticated' });

    await user.click(
      await screen.findByRole('button', {
        name: 'Выйти на всех других устройствах',
      }),
    );

    expect(sent.endedOthers).toBe(1);
    expect(
      await screen.findByText('Выполнен выход на остальных устройствах'),
    ).toBeInTheDocument();
  });

  it('changes the password, saying what was wrong', async () => {
    mockAccount();
    const sent = mockSessions();
    const { user } = renderApp('/settings', { session: 'authenticated' });
    const current = await screen.findByLabelText('Текущий пароль');
    const next = screen.getByLabelText('Новый пароль');
    const submit = screen.getByRole('button', { name: 'Сменить пароль' });

    // Checked before any request: the same password twice.
    await user.type(current, 'old secret 1');
    await user.type(next, 'old secret 1');
    await user.click(submit);
    expect(
      await screen.findByText('Новый пароль совпадает с текущим'),
    ).toBeInTheDocument();
    expect(sent.passwords).toEqual([]);

    await user.clear(current);
    await user.type(current, 'not my password');
    await user.clear(next);
    await user.type(next, 'brand new secret');
    await user.click(submit);
    expect(await screen.findByText('Неверный пароль')).toBeInTheDocument();

    await user.clear(current);
    await user.type(current, 'old secret 1');
    await user.click(submit);

    expect(
      await screen.findByText(
        'Пароль изменён, на других устройствах выполнен выход',
      ),
    ).toBeInTheDocument();
    expect(current).toHaveValue('');
    expect(sent.passwords.at(-1)).toEqual({
      currentPassword: 'old secret 1',
      newPassword: 'brand new secret',
    });
    // The other device left the list with the old password (refetched).
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('list', { name: 'Активные сеансы' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(1),
    );
  });
});
