import { screen, waitFor, within } from '@testing-library/react';
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
          currency: 'RUB',
          openingBalance: '0.00',
          allowNegative: false,
          archivedAt: null,
          balance: '250.50',
        },
      ],
    });
    renderApp('/accounts', { session: 'authenticated' });

    const cash = await screen.findByRole('button', { name: /Наличные/ });
    expect(cash).toHaveTextContent(/без минуса.*250,50\s₽/);
    expect(screen.getByText(/^1\s750,50\s₽/)).toBeInTheDocument();
  });

  it('shows a goal against the balance of its account', async () => {
    mockAccount({
      accounts: [{ ...MAIN_ACCOUNT, balance: '50000.00' }],
      goals: [
        {
          id: '0199d0a4-7777-7000-8000-000000000001',
          name: 'На отпуск',
          account: {
            id: MAIN_ACCOUNT.id,
            name: MAIN_ACCOUNT.name,
            type: 'card',
            currency: 'RUB',
          },
          targetAmount: '200000.00',
          targetDate: null,
          // The API counts these from the balance; so does the mock.
          saved: '0.00',
          remaining: '0.00',
          percent: 0,
          monthly: null,
        },
      ],
    });
    renderApp('/accounts', { session: 'authenticated' });

    const goal = await screen.findByRole('button', { name: /На отпуск/ });
    // Intl groups thousands with a no-break space; read it as a plain one.
    const text = goal.textContent?.split(String.fromCharCode(160)).join(' ');
    expect(text).toContain('50 000,00 ₽ из 200 000,00 ₽');
    expect(text).toContain('осталось 150 000,00 ₽');
    expect(
      screen.getByRole('progressbar', { name: /На отпуск/ }),
    ).toHaveAttribute('aria-valuenow', '25');
  });

  it('starts a goal on an account', async () => {
    const { sent } = mockAccount();
    const { user } = renderApp('/accounts', { session: 'authenticated' });
    await screen.findByText('Целей пока нет');

    const form = within(
      screen.getByRole('heading', { name: 'Новая цель' }).closest('section')!,
    );
    await user.type(form.getByLabelText('Название'), 'На отпуск');
    await user.selectOptions(form.getByLabelText('Счёт'), MAIN_ACCOUNT.name);
    await user.type(form.getByLabelText('Сколько накопить'), '200 000');
    await user.click(form.getByRole('button', { name: 'Добавить' }));

    expect(await screen.findByText('Цель добавлена')).toBeInTheDocument();
    expect(sent.goals).toEqual([
      {
        name: 'На отпуск',
        accountId: MAIN_ACCOUNT.id,
        targetAmount: '200000',
        targetDate: null,
      },
    ]);
  });

  it('creates an account that must not go negative', async () => {
    const { sent } = mockAccount();
    const { user } = renderApp('/accounts', { session: 'authenticated' });
    await screen.findByRole('button', { name: /Основной счёт/ });

    // The page also has the goal form, which has a "Название" of its own.
    const form = within(
      screen.getByRole('heading', { name: 'Новый счёт' }).closest('section')!,
    );
    await user.click(form.getByRole('radio', { name: 'Наличные' }));
    await user.type(form.getByLabelText('Название'), 'Кошелёк');
    await user.type(form.getByLabelText('Начальный остаток'), '1 500');
    await user.click(form.getByRole('switch', { name: 'Не уходить в минус' }));
    await user.click(form.getByRole('button', { name: 'Добавить счёт' }));

    expect(
      await screen.findByRole('button', { name: /Кошелёк/ }),
    ).toHaveTextContent(/1\s500,00\s₽/);
    expect(sent.accounts).toEqual([
      {
        name: 'Кошелёк',
        type: 'cash',
        currency: 'RUB',
        openingBalance: '1500',
        allowNegative: false,
      },
    ]);
  });

  it('keeps an account in its currency and totals all of them in roubles', async () => {
    const { sent } = mockAccount();
    const { user } = renderApp('/accounts', { session: 'authenticated' });
    await screen.findByRole('button', { name: /Основной счёт/ });

    const form = within(
      screen.getByRole('heading', { name: 'Новый счёт' }).closest('section')!,
    );
    // The base currency is preselected.
    expect(form.getByLabelText('Валюта')).toHaveValue('RUB');
    await user.type(form.getByLabelText('Название'), 'Доллары');
    await user.selectOptions(form.getByLabelText('Валюта'), 'USD');
    await user.type(form.getByLabelText('Начальный остаток'), '10');
    await user.click(form.getByRole('button', { name: 'Добавить счёт' }));

    expect(sent.accounts).toEqual([
      expect.objectContaining({ currency: 'USD', openingBalance: '10' }),
    ]);
    const dollars = await screen.findByRole('button', { name: /Доллары/ });
    expect(dollars).toHaveTextContent(/Карта · USD.*10,00\s\$/);
    // Converted at today's rate (90 in the mock): approximate.
    expect(screen.getByText(/^≈ 900,00\s₽/)).toBeInTheDocument();
  });

  describe('archive', () => {
    const CASH = {
      id: '0199d0a4-0000-7000-8000-0000000acc02',
      name: 'Наличные',
      type: 'cash',
      currency: 'RUB',
      openingBalance: '0.00',
      allowNegative: false,
      archivedAt: null,
      balance: '0.00',
    } as const;

    it('archives an empty account, which folds away under the list', async () => {
      const { sent } = mockAccount({ accounts: [MAIN_ACCOUNT, CASH] });
      const { user } = renderApp('/accounts', { session: 'authenticated' });

      await user.click(await screen.findByRole('button', { name: /Наличные/ }));
      const dialog = within(screen.getByRole('dialog', { name: 'Счёт' }));
      await user.click(
        dialog.getByRole('button', { name: 'Отправить в архив' }),
      );
      // Twice: it stops the account's recurring payments.
      await user.click(
        dialog.getByRole('button', { name: 'Подтвердите: Отправить в архив' }),
      );

      expect(await screen.findByText('Счёт в архиве')).toBeInTheDocument();
      expect(sent.archived).toEqual([CASH.id]);
      const archive = await screen.findByRole('list', {
        name: 'Счета в архиве',
      });
      expect(
        within(archive).getByRole('button', { name: /Наличные/ }),
      ).toBeInTheDocument();
    });

    it('says what is left on an account that is not empty', async () => {
      mockAccount({ accounts: [MAIN_ACCOUNT, { ...CASH, balance: '250.00' }] });
      const { user } = renderApp('/accounts', { session: 'authenticated' });

      await user.click(await screen.findByRole('button', { name: /Наличные/ }));
      const dialog = within(screen.getByRole('dialog', { name: 'Счёт' }));
      await user.click(
        dialog.getByRole('button', { name: 'Отправить в архив' }),
      );
      await user.click(
        dialog.getByRole('button', { name: 'Подтвердите: Отправить в архив' }),
      );

      expect(
        await dialog.findByText(/сначала переведите остаток/),
      ).toBeInTheDocument();
    });

    it('brings an archived account back', async () => {
      mockAccount({
        accounts: [
          MAIN_ACCOUNT,
          { ...CASH, archivedAt: '2026-10-01T10:00:00.000Z' },
        ],
      });
      const { user } = renderApp('/accounts', { session: 'authenticated' });

      await user.click(await screen.findByText('Архив · 1'));
      await user.click(screen.getByRole('button', { name: /Наличные/ }));
      await user.click(
        within(screen.getByRole('dialog', { name: 'Счёт' })).getByRole(
          'button',
          { name: 'Вернуть из архива' },
        ),
      );

      expect(
        await screen.findByText('Счёт снова в работе'),
      ).toBeInTheDocument();
      // The list comes back with the account in use: the archive folds away.
      await waitFor(() =>
        expect(screen.queryByText(/^Архив/)).not.toBeInTheDocument(),
      );
    });

    it('keeps an archived account out of the new transaction form', async () => {
      mockAccount({
        accounts: [
          MAIN_ACCOUNT,
          { ...CASH, archivedAt: '2026-10-01T10:00:00.000Z' },
        ],
      });
      renderApp('/', { session: 'authenticated' });

      const form = within(
        (
          await screen.findByRole('heading', { name: 'Новая операция' })
        ).closest('section')!,
      );
      const accounts = await form.findByLabelText('Счёт');
      await within(accounts).findByRole('option', { name: 'Основной счёт' });
      expect(
        within(accounts)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Выберите счёт', 'Основной счёт']);
    });
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
