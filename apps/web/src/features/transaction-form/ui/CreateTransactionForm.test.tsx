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
        tags: [],
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

  describe('split by categories', () => {
    const HOME = {
      id: '0199d0a4-0000-7000-8000-00000000a0e1',
      kind: 'expense',
      name: 'Дом',
    } as const;

    it('sends the parts instead of a category, the rest filled in on request', async () => {
      const { sent } = mockAccount({ categories: [FOOD, HOME, SALARY] });
      const { user } = renderApp('/', { session: 'authenticated' });
      await categoriesLoaded();

      await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
      await user.type(screen.getByLabelText('Сумма'), '2 500');
      await user.click(
        screen.getByRole('button', { name: 'Разделить по категориям' }),
      );

      // The chosen category became the first part.
      expect(screen.queryByLabelText('Категория')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Категория части 1')).toHaveValue(FOOD.id);
      await user.type(screen.getByLabelText('Сумма части 1'), '2000');
      await user.selectOptions(
        screen.getByLabelText('Категория части 2'),
        HOME.name,
      );
      expect(screen.getByText(/Не распределено 500,00\s₽/)).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'вписать в часть 2' }),
      );
      expect(screen.getByLabelText('Сумма части 2')).toHaveValue('500,00');
      expect(
        screen.getByText('Сумма распределена полностью'),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Добавить операцию' }),
      );

      expect(await screen.findByText('Операция добавлена')).toBeInTheDocument();
      expect(sent.transactions).toEqual([
        expect.objectContaining({
          type: 'expense',
          amount: '2500',
          splits: [
            { categoryId: FOOD.id, amount: '2000' },
            { categoryId: HOME.id, amount: '500.00' },
          ],
        }),
      ]);
      expect(sent.transactions[0]).not.toHaveProperty('categoryId');
      // The next entry starts plain.
      expect(screen.getByLabelText('Категория')).toHaveValue('');
    });

    it('refuses parts that do not add up, before sending', async () => {
      const { sent } = mockAccount({ categories: [FOOD, HOME] });
      const { user } = renderApp('/', { session: 'authenticated' });
      await categoriesLoaded();

      await user.type(screen.getByLabelText('Сумма'), '1000');
      await user.click(
        screen.getByRole('button', { name: 'Разделить по категориям' }),
      );
      await user.selectOptions(
        screen.getByLabelText('Категория части 1'),
        FOOD.name,
      );
      await user.type(screen.getByLabelText('Сумма части 1'), '700');
      await user.selectOptions(
        screen.getByLabelText('Категория части 2'),
        HOME.name,
      );
      await user.type(screen.getByLabelText('Сумма части 2'), '400');
      expect(
        screen.getByText(/Части больше суммы на 100,00\s₽/),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Добавить операцию' }),
      );

      expect(
        await screen.findByText(/Части больше суммы операции на 100,00\s₽/),
      ).toBeInTheDocument();
      expect(sent.transactions).toEqual([]);
    });

    it('goes back to one category', async () => {
      const { sent } = mockAccount({ categories: [FOOD, HOME] });
      const { user } = renderApp('/', { session: 'authenticated' });
      await categoriesLoaded();

      await user.click(
        screen.getByRole('button', { name: 'Разделить по категориям' }),
      );
      await user.selectOptions(
        screen.getByLabelText('Категория части 1'),
        HOME.name,
      );
      await user.click(screen.getByRole('button', { name: 'Не разделять' }));
      await user.type(screen.getByLabelText('Сумма'), '300');
      await user.click(
        screen.getByRole('button', { name: 'Добавить операцию' }),
      );

      expect(await screen.findByText('Операция добавлена')).toBeInTheDocument();
      expect(sent.transactions).toEqual([
        expect.objectContaining({ categoryId: HOME.id, amount: '300' }),
      ]);
      expect(sent.transactions[0]).not.toHaveProperty('splits');
    });
  });

  describe('tags', () => {
    const TRIP = { id: '0199d0a4-0000-7000-8000-0000000071a9', name: 'Отпуск' };

    it('sends the tags typed, an existing one with its own spelling, and keeps them for the next entry', async () => {
      const { sent } = mockAccount({ categories: [FOOD], tags: [TRIP] });
      const { user } = renderApp('/', { session: 'authenticated' });
      await categoriesLoaded();

      await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
      await user.type(screen.getByLabelText('Сумма'), '700');
      const tags = screen.getByLabelText('Теги');
      // Enter adds and does not submit; so do a comma and leaving the field.
      await user.type(tags, 'отпуск{Enter}Сочи,Море');
      await user.tab();
      const chosen = screen.getByRole('list', { name: 'Выбранные теги' });
      expect(
        within(chosen)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Отпуск', 'Сочи', 'Море']);
      await user.click(
        screen.getByRole('button', { name: 'Убрать тег «Море»' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Добавить операцию' }),
      );

      expect(await screen.findByText('Операция добавлена')).toBeInTheDocument();
      expect(sent.transactions).toEqual([
        expect.objectContaining({ amount: '700', tags: ['Отпуск', 'Сочи'] }),
      ]);
      // Entries of a trip come in a row.
      expect(
        within(
          screen.getByRole('list', { name: 'Выбранные теги' }),
        ).getAllByRole('listitem'),
      ).toHaveLength(2);
    });

    it('takes the last tag back with Backspace in an empty field', async () => {
      mockAccount({ categories: [FOOD] });
      const { user } = renderApp('/', { session: 'authenticated' });
      await categoriesLoaded();

      const tags = screen.getByLabelText('Теги');
      await user.type(tags, 'Ремонт{Enter}{Backspace}');

      expect(
        screen.queryByRole('list', { name: 'Выбранные теги' }),
      ).not.toBeInTheDocument();
    });

    it('splits pasted names at the commas, the last one left to finish', async () => {
      mockAccount({ categories: [FOOD] });
      const { user } = renderApp('/', { session: 'authenticated' });
      await categoriesLoaded();

      await user.click(screen.getByLabelText('Теги'));
      await user.paste('Отпуск, Сочи,Мо');

      expect(
        within(screen.getByRole('list', { name: 'Выбранные теги' }))
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Отпуск', 'Сочи']);
      expect(screen.getByLabelText('Теги')).toHaveValue('Мо');
    });
  });

  describe('receipt photos', () => {
    const photo = (name: string) =>
      new File([new Uint8Array(64)], name, { type: 'image/jpeg' });

    it('sends the photos picked to the transaction once it is saved', async () => {
      const { sent, state } = mockAccount({ categories: [FOOD] });
      const { user } = renderApp('/', { session: 'authenticated' });
      await categoriesLoaded();

      await user.selectOptions(screen.getByLabelText('Категория'), FOOD.name);
      await user.type(screen.getByLabelText('Сумма'), '450');
      await user.upload(screen.getByLabelText('Добавить фото чека'), [
        photo('one.jpg'),
        photo('two.jpg'),
        photo('three.jpg'),
      ]);
      // Changed my mind about one of them: not sent yet, simply dropped.
      await user.click(
        screen.getByRole('button', { name: 'Убрать: Фото чека 2' }),
      );
      expect(sent.receipts).toEqual([]);
      await user.click(
        screen.getByRole('button', { name: 'Добавить операцию' }),
      );

      expect(await screen.findByText('Операция добавлена')).toBeInTheDocument();
      const created = state.transactions[0]!;
      expect(sent.receipts).toEqual([
        { transactionId: created.id, name: 'one.jpg' },
        { transactionId: created.id, name: 'three.jpg' },
      ]);
      // The next entry starts without them.
      expect(
        screen.queryByRole('button', { name: /Убрать: Фото чека/ }),
      ).not.toBeInTheDocument();
    });
  });
});
