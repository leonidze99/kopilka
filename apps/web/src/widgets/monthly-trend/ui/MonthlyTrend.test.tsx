import { screen, within } from '@testing-library/react';
import { mockAccount } from '@/test/account';
import { renderApp } from '@/test/render';

describe('MonthlyTrend', () => {
  const monthly = [
    {
      month: '2026-08',
      income: '120000.00',
      expense: '95000.50',
      balance: '24999.50',
    },
    {
      month: '2026-09',
      income: '100000.00',
      expense: '130000.00',
      balance: '-30000.00',
    },
  ];

  it('shows the year up to the month, and a click picks a month', async () => {
    mockAccount({ monthly });
    const { user, router } = renderApp('/?month=2026-09', {
      session: 'authenticated',
    });

    const chart = await screen.findByRole('region', {
      name: 'Доходы и расходы за год',
    });
    const months = await within(chart).findAllByRole('button', {
      name: /^[А-Я][а-я]+ \d{4}:/,
    });
    // October 2025 to September 2026, the selected month last and pressed.
    expect(months).toHaveLength(12);
    expect(months[0]).toHaveAccessibleName(/^Октябрь 2025: доходы 0,00/);
    const september = months[11];
    expect(september).toHaveAttribute('aria-pressed', 'true');
    expect(september).toHaveAccessibleName(
      /Сентябрь 2026: доходы 100\s000,00\s₽, расходы 130\s000,00\s₽/,
    );

    // The axis goes up to a round number above the largest bar.
    expect(within(chart).getByText('150 тыс.')).toBeInTheDocument();

    // The balance is in the table already; hovering adds the tooltip's.
    const balance = /24\s999,50\s₽/;
    expect(within(chart).getAllByText(balance)).toHaveLength(1);
    await user.hover(months[10]!);
    expect(within(chart).getAllByText(balance)).toHaveLength(2);

    await user.click(months[10]!);
    expect(router.state.location.search).toBe('?month=2026-08');
  });

  it('has the same numbers as a table', async () => {
    mockAccount({ monthly });
    const { user } = renderApp('/?month=2026-09', { session: 'authenticated' });

    await user.click(await screen.findByText('Показать таблицей'));

    const row = screen.getByRole('row', { name: /Сентябрь 2026/ });
    expect(row).toHaveTextContent(/130\s000,00\s₽.*−30\s000,00\s₽/);
  });
});
