import { fireEvent, screen, within } from '@testing-library/react';
import { http } from 'msw';
import { mockAccount } from '@/test/account';
import { apiError, apiUrl, FOOD, MAIN_ACCOUNT, SALARY } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const CASH = {
  id: '0199d0a4-0000-7000-8000-0000000acc02',
  name: 'Наличные',
  type: 'cash',
  openingBalance: '0.00',
  allowNegative: false,
  balance: '0.00',
} as const;

const optionNames = () =>
  within(screen.getByLabelText('Категория'))
    .getAllByRole('option')
    .map((option) => option.textContent);

// The list filter offers the same categories: look in the form's select.
const categoriesLoaded = async () =>
  within(await screen.findByLabelText('Категория')).findByRole('option', {
    name: FOOD.name,
  });

describe('CreateTransactionForm', () => {
  it('sends the amount normalized and the local date as ISO, then lists the transaction', async () => {
    const { sent } = mockAccount({ categories: [FOOD, SALARY] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await categoriesLoaded();

    await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
    await user.type(screen.getByLabelText('Сумма'), '1 234,5');
    // user-event cannot type into datetime-local in jsdom.
    fireEvent.change(screen.getByLabelText('Дата и время'), {
      target: { value: '2026-10-05T14:30' },
    });
    await user.type(screen.getByLabelText('Комментарий'), 'Ужин');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    const list = await screen.findByRole('list', { name: /октября/ });
    expect(await within(list).findByText(/1\s234,50/)).toBeInTheDocument();
    expect(screen.getByText('Операция добавлена')).toBeInTheDocument();
    expect(sent.transactions).toEqual([
      {
        type: 'expense',
        categoryId: FOOD.id,
        // The only account, picked without asking.
        accountId: MAIN_ACCOUNT.id,
        amount: '1234.5',
        // The picked wall-clock time in the user's time zone.
        occurredAt: new Date('2026-10-05T14:30').toISOString(),
        comment: 'Ужин',
      },
    ]);
    // Ready for the next one; the category is kept.
    expect(screen.getByLabelText('Сумма')).toHaveValue('');
    expect(screen.getByLabelText('Категория')).toHaveValue(FOOD.id);
  });

  it('records a transfer between two accounts', async () => {
    const { sent } = mockAccount({ accounts: [MAIN_ACCOUNT, CASH] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await screen.findByRole('button', { name: /^Наличные/ });

    await user.click(screen.getByRole('radio', { name: 'Перевод' }));
    // The source is preselected: the first account.
    expect(screen.getByLabelText('Со счёта')).toHaveValue(MAIN_ACCOUNT.id);
    await user.selectOptions(screen.getByLabelText('На счёт'), CASH.name);
    await user.type(screen.getByLabelText('Сумма'), '500');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    expect(await screen.findByText('Перевод сохранён')).toBeInTheDocument();
    expect(sent.transactions).toEqual([
      expect.objectContaining({
        type: 'transfer',
        accountId: MAIN_ACCOUNT.id,
        toAccountId: CASH.id,
        amount: '500',
      }),
    ]);
    expect(sent.transactions[0]).not.toHaveProperty('categoryId');
  });

  it('shows a shortfall reported by the API under the amount', async () => {
    mockAccount({ categories: [FOOD] });
    server.use(
      http.post(apiUrl('/transactions'), () =>
        apiError(409, 'INSUFFICIENT_FUNDS', 'Account must not go negative', [
          {
            field: 'amount',
            message: 'На счёте «Основной счёт» не хватает 500,00 ₽',
          },
        ]),
      ),
    );
    const { user } = renderApp('/', { session: 'authenticated' });
    await categoriesLoaded();

    await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
    await user.type(screen.getByLabelText('Сумма'), '500');
    await user.click(screen.getByRole('button', { name: 'Добавить операцию' }));

    expect(
      await screen.findByText('На счёте «Основной счёт» не хватает 500,00 ₽'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Сумма')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('offers only categories of the chosen kind', async () => {
    mockAccount({ categories: [FOOD, SALARY] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await categoriesLoaded();

    expect(optionNames()).toEqual(['Выберите категорию', FOOD.name]);

    await user.click(screen.getByRole('radio', { name: 'Доход' }));

    expect(optionNames()).toEqual(['Выберите категорию', SALARY.name]);
  });

  it('validates with the shared schema before sending anything', async () => {
    const { sent } = mockAccount({ categories: [FOOD] });
    const { user } = renderApp('/', { session: 'authenticated' });
    await categoriesLoaded();

    await user.type(screen.getByLabelText('Сумма'), '12,345');
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
