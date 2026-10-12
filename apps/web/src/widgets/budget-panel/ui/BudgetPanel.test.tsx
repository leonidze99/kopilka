import { screen, within } from '@testing-library/react';
import { mockAccount } from '@/test/account';
import { FOOD } from '@/test/api';
import { renderApp } from '@/test/render';
import { currentMonth } from '@/shared/lib';

const CAFE = {
  id: '0199d0a4-0000-7000-8000-0000000000ca',
  kind: 'expense',
  name: 'Кафе',
} as const;

const budget = (
  category: typeof FOOD | typeof CAFE,
  limit: string,
  spent: string,
) => ({
  category,
  limit,
  spent,
  remaining: (Number(limit) - Number(spent)).toFixed(2),
  since: '2026-10',
});

const panel = async () =>
  within(
    (await screen.findByRole('heading', { name: 'Бюджеты' })).closest(
      'section',
    )!,
  );

describe('BudgetPanel', () => {
  it('shows each limit against what was spent, overspending in red words', async () => {
    mockAccount({
      categories: [FOOD, CAFE],
      budgets: [
        budget(CAFE, '300.00', '450.00'),
        budget(FOOD, '10000.00', '6500.00'),
      ],
    });
    renderApp('/', { session: 'authenticated' });

    const budgets = await panel();
    const [cafe, food] = await budgets.findAllByRole('button', {
      name: /Кафе|Продукты/,
    });
    expect(cafe).toHaveTextContent(
      /450,00\s₽ из 300,00\s₽.*Перерасход 150,00\s₽/,
    );
    expect(food).toHaveTextContent(
      /6\s500,00\s₽ из 10\s000,00\s₽.*Осталось 3\s500,00\s₽/,
    );
    expect(budgets.getByText(/Потрачено/)).toHaveTextContent(
      /6\s950,00\s₽ из 10\s300,00\s₽/,
    );
  });

  it('sets a limit for a category from the shown month', async () => {
    const { sent } = mockAccount({ categories: [FOOD] });
    const { user } = renderApp('/', { session: 'authenticated' });

    await user.click(
      await (await panel()).findByRole('button', { name: 'Задать бюджет' }),
    );
    const dialog = within(screen.getByRole('dialog', { name: 'Новый бюджет' }));
    await user.selectOptions(dialog.getByLabelText('Категория'), FOOD.name);
    await user.type(dialog.getByLabelText('Лимит в месяц'), '10 000');
    await user.click(dialog.getByRole('button', { name: 'Сохранить' }));

    expect(
      await (await panel()).findByRole('button', { name: /Продукты/ }),
    ).toHaveTextContent(/из 10\s000,00\s₽/);
    expect(sent.budgets).toEqual([
      { categoryId: FOOD.id, month: currentMonth(), amount: '10000' },
    ]);
  });

  it('stops a budget from the shown month', async () => {
    const { sent } = mockAccount({
      categories: [FOOD],
      budgets: [budget(FOOD, '10000.00', '0.00')],
    });
    const { user } = renderApp('/', { session: 'authenticated' });

    await user.click(
      await (await panel()).findByRole('button', { name: /Продукты/ }),
    );
    const dialog = within(
      screen.getByRole('dialog', { name: 'Бюджет: Продукты' }),
    );
    await user.click(dialog.getByRole('button', { name: /Убрать бюджет/ }));

    expect(
      await (await panel()).findByText('Бюджетов пока нет'),
    ).toBeInTheDocument();
    expect(sent.budgets).toEqual([
      { categoryId: FOOD.id, month: currentMonth(), amount: null },
    ]);
  });
});
