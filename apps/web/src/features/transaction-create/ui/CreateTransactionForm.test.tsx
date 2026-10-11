import { fireEvent, screen, within } from '@testing-library/react';
import { mockAccount } from '@/test/account';
import { FOOD, SALARY } from '@/test/api';
import { renderApp } from '@/test/render';

const optionNames = () =>
  within(screen.getByLabelText('Категория'))
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('CreateTransactionForm', () => {
  it('sends the amount normalized and the local date as ISO, then lists the transaction', async () => {
    const { sent } = mockAccount({ categories: [FOOD, SALARY] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findByRole('option', { name: FOOD.name });

    await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
    await user.type(screen.getByLabelText('Сумма, ₽'), '1 234,5');
    // user-event cannot type into datetime-local in jsdom.
    fireEvent.change(screen.getByLabelText('Дата и время'), {
      target: { value: '2026-10-05T14:30' },
    });
    await user.type(screen.getByLabelText('Комментарий'), 'Ужин');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    const list = await screen.findByRole('list');
    expect(await within(list).findByText(/1\s234,50/)).toBeInTheDocument();
    expect(sent.transactions).toEqual([
      {
        categoryId: FOOD.id,
        amount: '1234.5',
        // The picked wall-clock time in the user's time zone.
        occurredAt: new Date('2026-10-05T14:30').toISOString(),
        comment: 'Ужин',
      },
    ]);
    // Ready for the next one; the category is kept.
    expect(screen.getByLabelText('Сумма, ₽')).toHaveValue('');
    expect(screen.getByLabelText('Категория')).toHaveValue(FOOD.id);
  });

  it('offers only categories of the chosen kind', async () => {
    mockAccount({ categories: [FOOD, SALARY] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findByRole('option', { name: FOOD.name });

    expect(optionNames()).toEqual(['Выберите категорию', FOOD.name]);

    await user.click(screen.getByRole('radio', { name: 'Доход' }));

    expect(optionNames()).toEqual(['Выберите категорию', SALARY.name]);
  });

  it('validates with the shared schema before sending anything', async () => {
    const { sent } = mockAccount({ categories: [FOOD] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findByRole('option', { name: FOOD.name });

    await user.type(screen.getByLabelText('Сумма, ₽'), '12,345');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    expect(
      await screen.findByText('Выберите категорию', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Сумма — число, не больше двух знаков после запятой'),
    ).toBeInTheDocument();
    expect(sent.transactions).toEqual([]);
  });

  it('points to the categories page when there are no categories yet', async () => {
    mockAccount();
    renderApp('/', { session: 'authenticated' });

    expect(
      await screen.findByText(/Категорий этого типа пока нет/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Создать' })).toHaveAttribute(
      'href',
      '/categories',
    );
  });
});
