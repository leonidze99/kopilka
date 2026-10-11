import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockAccount } from '@/test/account';
import { apiUrl, FOOD, SALARY, transaction } from '@/test/api';
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

  it('deletes a transaction only after confirmation', async () => {
    const { state } = mockAccount({
      categories: [FOOD],
      transactions: [transaction({ category: FOOD })],
    });
    const { user } = renderApp('/', { session: 'authenticated' });

    await user.click(
      await screen.findByRole('button', {
        name: 'Удалить операцию «Продукты»',
      }),
    );
    expect(state.transactions).toHaveLength(1);

    await user.click(
      screen.getByRole('button', {
        name: 'Подтвердите: Удалить операцию «Продукты»',
      }),
    );

    expect(await screen.findByText('Операций пока нет')).toBeInTheDocument();
    expect(state.transactions).toEqual([]);
  });
});
