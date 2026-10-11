import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { mockAccount } from '@/test/account';
import { apiError, MAIN_ACCOUNT } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { API_URL } from '@/shared/config/env';

describe('AccountsPage', () => {
  it('lists accounts with their balances and the total from the API', async () => {
    mockAccount({
      accounts: [
        { ...MAIN_ACCOUNT, balance: '1500.00' },
        {
          id: '0199d0a4-0000-7000-8000-0000000acc02',
          name: 'Наличные',
          type: 'cash',
          openingBalance: '0.00',
          allowNegative: false,
          balance: '250.50',
        },
      ],
    });
    renderApp('/accounts', { session: 'authenticated' });

    const cash = await screen.findByRole('button', { name: /Наличные/ });
    expect(cash).toHaveTextContent(/без минуса.*250,50\s₽/);
    expect(screen.getByText(/^1\s750,50\s₽/)).toBeInTheDocument();
  });

  it('creates an account that must not go negative', async () => {
    const { sent } = mockAccount();
    const { user } = renderApp('/accounts', { session: 'authenticated' });
    await screen.findByRole('button', { name: /Основной счёт/ });

    await user.click(screen.getByRole('radio', { name: 'Наличные' }));
    await user.type(screen.getByLabelText('Название'), 'Кошелёк');
    await user.type(screen.getByLabelText('Начальный остаток'), '1 500');
    await user.click(
      screen.getByRole('switch', { name: 'Не уходить в минус' }),
    );
    await user.click(screen.getByRole('button', { name: 'Добавить счёт' }));

    expect(
      await screen.findByRole('button', { name: /Кошелёк/ }),
    ).toHaveTextContent(/1\s500,00\s₽/);
    expect(sent.accounts).toEqual([
      {
        name: 'Кошелёк',
        type: 'cash',
        openingBalance: '1500',
        allowNegative: false,
      },
    ]);
  });

  it('explains why an account with transactions cannot be deleted', async () => {
    mockAccount();
    server.use(
      http.delete(`${API_URL}/accounts/:id`, () =>
        apiError(409, 'ACCOUNT_IN_USE', 'Account has transactions'),
      ),
    );
    const { user } = renderApp('/accounts', { session: 'authenticated' });

    await user.click(
      await screen.findByRole('button', { name: /Основной счёт/ }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Счёт' }));
    await user.click(
      dialog.getByRole('button', { name: 'Удалить счёт «Основной счёт»' }),
    );
    await user.click(
      dialog.getByRole('button', {
        name: 'Подтвердите: Удалить счёт «Основной счёт»',
      }),
    );

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'По счёту есть операции',
    );
  });
});
