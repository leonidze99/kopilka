import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockAccount } from '@/test/account';
import { apiUrl, FOOD } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const TRIP = { id: '0199d0a4-0000-7000-8000-0000000071a9', name: 'Отпуск' };
const SOCHI = { id: '0199d0a4-0000-7000-8000-00000000050c', name: 'Сочи' };

describe('TagBreakdown', () => {
  it('lists the tags of the month with their share and filters the list by one', async () => {
    mockAccount({
      categories: [FOOD],
      tags: [TRIP, SOCHI],
      summary: { income: '0.00', expense: '1000.00', balance: '-1000.00' },
      tagTotals: [
        { tag: TRIP, total: '600.00' },
        { tag: SOCHI, total: '250.00' },
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

    const list = await screen.findByRole('list', { name: 'Расходы по тегам' });
    const [trip, sochi] = within(list).getAllByRole('button');
    // Shares of the month's total: the client adds no money up.
    expect(trip).toHaveTextContent(/Отпуск.*60%.*600,00\s₽/);
    expect(sochi).toHaveTextContent(/Сочи.*25%.*250,00\s₽/);

    await user.click(trip!);

    expect(trip).toHaveAttribute('aria-pressed', 'true');
    expect(router.state.location.search).toBe(`?tag=${TRIP.id}`);
    expect(
      await screen.findByText(/«Отпуск» за всё время/),
    ).toBeInTheDocument();
    expect(listQueries.at(-1)?.get('tagId')).toBe(TRIP.id);

    // A second click shows everything again.
    await user.click(trip!);
    expect(router.state.location.search).toBe('');
  });

  it('says so when no transaction of the month has a tag', async () => {
    mockAccount({ tags: [TRIP] });
    renderApp('/', { session: 'authenticated' });

    expect(
      await screen.findByText(/расходов с тегами нет/),
    ).toBeInTheDocument();
  });

  it('is not shown before the first tag', async () => {
    mockAccount({ categories: [FOOD] });
    renderApp('/', { session: 'authenticated' });

    await screen.findByRole('heading', { name: 'По категориям' });
    await screen.findByText(/расходов нет/);
    expect(
      screen.queryByRole('heading', { name: 'По тегам' }),
    ).not.toBeInTheDocument();
  });
});
