import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { mockAccount } from '@/test/account';
import { apiUrl } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

describe('MonthSummary', () => {
  it('shows the totals of the current local month against the same days of the previous one', async () => {
    mockAccount();
    const periods: { from: string | null; to: string | null }[] = [];
    server.use(
      http.get(apiUrl('/transactions/summary'), ({ request }) => {
        const query = new URL(request.url).searchParams;
        const from = query.get('from');
        periods.push({ from, to: query.get('to') });
        const thisMonth =
          from ===
          new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString();
        return HttpResponse.json(
          thisMonth
            ? { income: '50000.00', expense: '1234.50', balance: '48765.50' }
            : { income: '40000.00', expense: '1500.00', balance: '38500.00' },
        );
      }),
    );

    renderApp('/', { session: 'authenticated' });

    expect(await screen.findByText(/48\s765,50\s₽/)).toBeInTheDocument();
    expect(screen.getByText(/50\s000,00\s₽/)).toBeInTheDocument();
    expect(screen.getByText(/1\s234,50\s₽/)).toBeInTheDocument();

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    expect(periods).toContainEqual({
      from: start.toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    });
    // The previous month only up to the same day and time.
    const previous = periods.find(
      (p) => p.from === previousStart.toISOString(),
    );
    // The same day of the previous month; on the 31st after a 30-day month,
    // all of it.
    const to = new Date(previous?.to ?? '');
    expect(
      to.getDate() === now.getDate() || to.getTime() === start.getTime(),
    ).toBe(true);

    // 50 000 against 40 000; 1 234,50 against 1 500.
    expect(await screen.findByText(/^↑ 25% к 1/)).toBeInTheDocument();
    expect(screen.getByText(/^↓ 18% к 1/)).toBeInTheDocument();
  });

  it('compares a past month with the whole month before it', async () => {
    mockAccount();
    server.use(
      http.get(apiUrl('/transactions/summary'), ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.get('from') ===
            new Date(2026, 8, 1).toISOString()
            ? { income: '100.00', expense: '100.00', balance: '0.00' }
            : { income: '100.00', expense: '50.00', balance: '50.00' },
        ),
      ),
    );

    renderApp('/?month=2026-09', { session: 'authenticated' });

    expect(await screen.findByText('0% к августу')).toBeInTheDocument();
    expect(screen.getByText('↑ 100% к августу')).toBeInTheDocument();
  });
});
