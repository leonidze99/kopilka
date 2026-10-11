import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockAccount } from '@/test/account';
import { apiUrl, FOOD, SALARY } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const CAFE = {
  id: '0199d0a4-0000-7000-8000-0000000000ca',
  kind: 'expense',
  name: 'Кафе',
} as const;

describe('CategoryBreakdown', () => {
  it('lists categories with their share of the total and filters the list by one', async () => {
    mockAccount({
      categories: [FOOD, CAFE, SALARY],
      summary: { income: '0.00', expense: '1000.00', balance: '-1000.00' },
      categoryTotals: [
        { category: FOOD, total: '750.00' },
        { category: CAFE, total: '250.00' },
      ],
    });
    const listQueries: URLSearchParams[] = [];
    server.use(
      http.get(apiUrl('/transactions'), ({ request }) => {
        listQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );
    const { user, router } = renderApp('/', { session: 'authenticated' });

    const legend = await screen.findByRole('list', { name: 'Расходы' });
    const [food, cafe] = within(legend).getAllByRole('button');
    // Shares of the summary total: the client adds no money up.
    expect(food).toHaveTextContent(/Продукты.*75%.*750,00\s₽/);
    expect(cafe).toHaveTextContent(/Кафе.*25%.*250,00\s₽/);

    await user.click(food!);

    expect(food).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.search).toBe(`?category=${FOOD.id}`);
    await screen.findByRole('button', { name: 'Сбросить фильтр' });
    expect(listQueries.at(-1)?.get('categoryId')).toBe(FOOD.id);

    // A second click shows everything again.
    await user.click(food!);
    expect(router.state.location.search).toBe('');
  });

  it('switches to income', async () => {
    mockAccount({ categories: [FOOD, SALARY] });
    const kinds: (string | null)[] = [];
    server.use(
      http.get(apiUrl('/transactions/by-category'), ({ request }) => {
        kinds.push(new URL(request.url).searchParams.get('kind'));
        return HttpResponse.json([]);
      }),
    );
    const { user } = renderApp('/', { session: 'authenticated' });
    expect(await screen.findByText(/расходов нет/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Доходы' }));

    expect(await screen.findByText(/доходов нет/)).toBeInTheDocument();
    expect(kinds).toEqual(['expense', 'income']);
  });
});
