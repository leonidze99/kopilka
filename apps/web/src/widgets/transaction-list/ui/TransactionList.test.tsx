import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockAccount } from '@/test/account';
import { apiUrl, FOOD, MAIN_ACCOUNT, SALARY, transaction } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('TransactionList', () => {
  it('shows income with a plus and expenses with a minus', async () => {
    mockAccount({
      categories: [FOOD, SALARY],
      transactions: [
        transaction({ amount: '50000.00', category: SALARY }),
        transaction({ amount: '1234.50', category: FOOD, comment: 'Ужин' }),
      ],
    });
    renderApp('/', { session: 'authenticated' });

    const rows = within(await screen.findByRole('list')).getAllByRole(
      'listitem',
    );
    expect(rows[0]).toHaveTextContent(/Зарплата.*\+50\s000,00\s₽/);
    expect(rows[1]).toHaveTextContent(/Продукты.*Ужин.*−1\s234,50\s₽/);
  });

  it('loads the next page with the cursor of the previous one', async () => {
    mockAccount({ categories: [FOOD] });
    const cursors: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/transactions'), ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return HttpResponse.json(
          cursor === 'page-2'
            ? { items: [transaction({ comment: 'третья' })], nextCursor: null }
            : {
                items: [
                  transaction({ comment: 'первая' }),
                  transaction({ comment: 'вторая' }),
                ],
                nextCursor: 'page-2',
              },
        );
      }),
    );
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findByText(/первая/);

    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));

    expect(await screen.findByText(/третья/)).toBeInTheDocument();
    expect(screen.getByText(/первая/)).toBeInTheDocument();
    expect(cursors).toEqual([null, 'page-2']);
    expect(
      screen.queryByRole('button', { name: 'Показать ещё' }),
    ).not.toBeInTheDocument();
  });

  it('shows a transfer between accounts, with a sign only from one of them', async () => {
    const cash = {
      id: '0199d0a4-0000-7000-8000-0000000acc02',
      name: 'Наличные',
      type: 'cash',
      openingBalance: '0.00',
      allowNegative: false,
      balance: '300.00',
    } as const;
    const transfer = {
      id: '0199d0a4-1111-7000-8000-0000000000aa',
      type: 'transfer',
      amount: '300.00',
      comment: null,
      occurredAt: '2026-10-05T12:00:00.000Z',
      createdAt: '2026-10-05T12:00:00.000Z',
      account: { id: MAIN_ACCOUNT.id, name: MAIN_ACCOUNT.name, type: 'card' },
      toAccount: { id: cash.id, name: cash.name, type: 'cash' },
    } as const;
    mockAccount({ accounts: [MAIN_ACCOUNT, cash], transactions: [transfer] });
    const { user } = renderApp('/', { session: 'authenticated' });

    const row = await screen.findByRole('button', { name: /Перевод/ });
    expect(row).toHaveTextContent(/Основной счёт → Наличные/);
    // Inside the user's money: no sign, it is neither gained nor spent.
    expect(row).toHaveTextContent(/300,00\s₽/);
    expect(row).not.toHaveTextContent(/[+−]300/);

    // From the cash account it is money in.
    await user.click(screen.getByRole('button', { name: /^Наличные/ }));
    expect(
      await screen.findByRole('button', { name: /Перевод.*\+300,00/ }),
    ).toBeInTheDocument();
  });

  it('edits a transaction in a dialog opened from its row', async () => {
    const { sent } = mockAccount({
      categories: [FOOD, SALARY],
      transactions: [
        transaction({ amount: '1234.50', category: FOOD, comment: 'Ужин' }),
      ],
    });
    const { user } = renderApp('/', { session: 'authenticated' });

    await user.click(await screen.findByText('Ужин'));
    const dialog = screen.getByRole('dialog', { name: 'Операция' });
    // Filled in, the amount written as people type it.
    expect(within(dialog).getByLabelText('Сумма')).toHaveValue('1234,50');
    expect(within(dialog).getByLabelText('Категория')).toHaveValue(FOOD.id);

    await user.clear(within(dialog).getByLabelText('Сумма'));
    await user.type(within(dialog).getByLabelText('Сумма'), '99');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/−99,00\s₽/)).toBeInTheDocument();
    expect(sent.replacements).toEqual([
      expect.objectContaining({
        type: 'expense',
        categoryId: FOOD.id,
        accountId: MAIN_ACCOUNT.id,
        amount: '99',
      }),
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Изменения сохранены')).toBeInTheDocument();
  });

  it('deletes a transaction from its dialog only after confirmation', async () => {
    const { state } = mockAccount({
      categories: [FOOD],
      transactions: [transaction({ category: FOOD, comment: 'Ужин' })],
    });
    const { user } = renderApp('/', { session: 'authenticated' });

    await user.click(await screen.findByText('Ужин'));
    const dialog = screen.getByRole('dialog', { name: 'Операция' });
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Удалить операцию «Продукты»',
      }),
    );
    expect(state.transactions).toHaveLength(1);

    await user.click(
      within(dialog).getByRole('button', {
        name: 'Подтвердите: Удалить операцию «Продукты»',
      }),
    );

    expect(await screen.findByText('Операций пока нет')).toBeInTheDocument();
    expect(state.transactions).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks the API for the picked month and filter and keeps them in the URL', async () => {
    mockAccount({ categories: [FOOD, SALARY] });
    const queries: URLSearchParams[] = [];
    server.use(
      http.get(apiUrl('/transactions'), ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );
    const { user, router } = renderApp('/?month=2026-03', {
      session: 'authenticated',
    });
    expect(await screen.findByText('Март 2026')).toBeInTheDocument();
    await screen.findByText('Операций пока нет');

    await user.selectOptions(screen.getByLabelText('Показать'), 'Все доходы');

    expect(
      await screen.findByRole('button', { name: 'Сбросить фильтр' }),
    ).toBeInTheDocument();
    const last = queries.at(-1);
    expect(last?.get('type')).toBe('income');
    expect(last?.get('from')).toBe(new Date(2026, 2, 1).toISOString());
    expect(last?.get('to')).toBe(new Date(2026, 3, 1).toISOString());
    expect(router.state.location.search).toBe('?month=2026-03&type=income');

    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }));

    expect(await screen.findByText('Апрель 2026')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?month=2026-04&type=income');
  });
});
