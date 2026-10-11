import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockAccount } from '@/test/account';
import { apiUrl } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('MonthSummary', () => {
  it('asks the API for the current local month and shows the totals', async () => {
    mockAccount();
    let query: URLSearchParams | undefined;
    server.use(
      http.get(apiUrl('/transactions/summary'), ({ request }) => {
        query = new URL(request.url).searchParams;
        return HttpResponse.json({
          income: '50000.00',
          expense: '1234.50',
          balance: '48765.50',
        });
      }),
    );

    renderApp('/', { session: 'authenticated' });

    expect(await screen.findByText(/48\s765,50\s₽/)).toBeInTheDocument();
    expect(screen.getByText(/50\s000,00\s₽/)).toBeInTheDocument();
    expect(screen.getByText(/1\s234,50\s₽/)).toBeInTheDocument();
    const now = new Date();
    expect(query?.get('from')).toBe(
      new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    );
    expect(query?.get('to')).toBe(
      new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    );
  });
});
