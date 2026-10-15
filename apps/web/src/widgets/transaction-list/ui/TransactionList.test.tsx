import {
  screen,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Schemas } from '@/shared/api';
import { mockAccount } from '@/test/account';
import { apiUrl, FOOD, MAIN_ACCOUNT, SALARY, transaction } from '@/test/api';
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

    // The list of the day both are dated (October 5th).
    const rows = within(
      await screen.findByRole('list', { name: /5 октября/ }),
    ).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/Зарплата.*\+50\s000,00\s₽/);
    expect(rows[1]).toHaveTextContent(/Продукты.*Ужин.*−1\s234,50\s₽/);
  });

  it('shows an expense of a foreign account with what it counts as in roubles', async () => {
    mockAccount({
      categories: [FOOD],
      transactions: [
        transaction({
          amount: '10.00',
          baseAmount: '925.50',
          account: {
            id: MAIN_ACCOUNT.id,
            name: 'Карта в долларах',
            type: 'card',
            currency: 'USD',
          },
        }),
      ],
    });
    renderApp('/', { session: 'authenticated' });

    const row = await screen.findByRole('button', { name: /Продукты/ });
    expect(row).toHaveTextContent(/−10,00\s\$≈ 925,50\s₽/);
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

  it('shows a transfer between accounts, with a sign only from one of them', async () => {
    const cash = {
      id: '0199d0a4-0000-7000-8000-0000000acc02',
      name: 'Наличные',
      type: 'cash',
      currency: 'RUB',
      openingBalance: '0.00',
      allowNegative: false,
      archivedAt: null,
      balance: '300.00',
    } as const;
    const transfer = {
      id: '0199d0a4-1111-7000-8000-0000000000aa',
      type: 'transfer',
      amount: '300.00',
      comment: null,
      occurredAt: '2026-10-05T12:00:00.000Z',
      createdAt: '2026-10-05T12:00:00.000Z',
      recurringRuleId: null,
      baseAmount: '300.00',
      baseAmountManual: false,
      account: {
        id: MAIN_ACCOUNT.id,
        name: MAIN_ACCOUNT.name,
        type: 'card',
        currency: 'RUB',
      },
      toAccount: {
        id: cash.id,
        name: cash.name,
        type: 'cash',
        currency: 'RUB',
      },
      toAmount: '300.00',
      tags: [] as { id: string; name: string }[],
      receipts: [] as Schemas['Receipt'][],
    } as const;
    mockAccount({ accounts: [MAIN_ACCOUNT, cash], transactions: [transfer] });
    const { user } = renderApp('/', { session: 'authenticated' });

    const row = await screen.findByRole('button', { name: /Перевод/ });
    expect(row).toHaveTextContent(/Основной счёт → Наличные/);
    // Inside the user's money: no sign, it is neither gained nor spent.
    expect(row).toHaveTextContent(/300,00\s₽/);
    expect(row).not.toHaveTextContent(/[+−]300/);

    // From the cash account it is money in.
    await user.click(screen.getByRole('button', { name: /^Наличные/ }));
    expect(
      await screen.findByRole('button', { name: /Перевод.*\+300,00/ }),
    ).toBeInTheDocument();
  });

  it('edits a transaction in a dialog opened from its row', async () => {
    const { sent } = mockAccount({
      categories: [FOOD, SALARY],
      transactions: [
        transaction({ amount: '1234.50', category: FOOD, comment: 'Ужин' }),
      ],
    });
    const { user } = renderApp('/', { session: 'authenticated' });

    await user.click(await screen.findByText('Ужин'));
    const dialog = screen.getByRole('dialog', { name: 'Операция' });
    // Filled in, the amount written as people type it.
    expect(within(dialog).getByLabelText('Сумма')).toHaveValue('1234,50');
    expect(within(dialog).getByLabelText('Категория')).toHaveValue(FOOD.id);

    await user.clear(within(dialog).getByLabelText('Сумма'));
    await user.type(within(dialog).getByLabelText('Сумма'), '99');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText(/−99,00\s₽/)).toBeInTheDocument();
    expect(sent.replacements).toEqual([
      expect.objectContaining({
        type: 'expense',
        categoryId: FOOD.id,
        accountId: MAIN_ACCOUNT.id,
        amount: '99',
      }),
    ]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Изменения сохранены')).toBeInTheDocument();
  });

  it('deletes a transaction from its dialog only after confirmation', async () => {
    const { state } = mockAccount({
      categories: [FOOD],
      transactions: [transaction({ category: FOOD, comment: 'Ужин' })],
    });
    const { user } = renderApp('/', { session: 'authenticated' });

    await user.click(await screen.findByText('Ужин'));
    const dialog = screen.getByRole('dialog', { name: 'Операция' });
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Удалить операцию «Продукты»',
      }),
    );
    expect(state.transactions).toHaveLength(1);

    await user.click(
      within(dialog).getByRole('button', {
        name: 'Подтвердите: Удалить операцию «Продукты»',
      }),
    );

    expect(await screen.findByText('Операций пока нет')).toBeInTheDocument();
    expect(state.transactions).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks the API for the picked month and filter and keeps them in the URL', async () => {
    mockAccount({ categories: [FOOD, SALARY] });
    const queries: URLSearchParams[] = [];
    server.use(
      http.get(apiUrl('/transactions'), ({ request }) => {
        queries.push(new URL(request.url).searchParams);
        return HttpResponse.json({ items: [], nextCursor: null });
      }),
    );
    const { user, router } = renderApp('/?month=2026-03', {
      session: 'authenticated',
    });
    expect(await screen.findByText('Март 2026')).toBeInTheDocument();
    await screen.findByText('Операций пока нет');

    await user.selectOptions(screen.getByLabelText('Показать'), 'Все доходы');

    expect(
      await screen.findByRole('button', { name: 'Сбросить фильтр' }),
    ).toBeInTheDocument();
    const last = queries.at(-1);
    expect(last?.get('type')).toBe('income');
    expect(last?.get('from')).toBe(new Date(2026, 2, 1).toISOString());
    expect(last?.get('to')).toBe(new Date(2026, 3, 1).toISOString());
    expect(router.state.location.search).toBe('?month=2026-03&type=income');

    await user.click(screen.getByRole('button', { name: 'Следующий месяц' }));

    expect(await screen.findByText('Апрель 2026')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?month=2026-04&type=income');
  });

  describe('search', () => {
    /** The list API with search: what each request asked, and q applied. */
    function mockSearch() {
      const rows = [
        transaction({ comment: 'Яндекс Такси' }),
        transaction({ comment: 'Пятёрочка у дома' }),
      ];
      const queries: URLSearchParams[] = [];
      server.use(
        http.get(apiUrl('/transactions'), ({ request }) => {
          const query = new URL(request.url).searchParams;
          queries.push(query);
          const q = query.get('q')?.toLowerCase().replaceAll('ё', 'е');
          return HttpResponse.json({
            items: rows.filter(
              (row) =>
                !q ||
                row.comment?.toLowerCase().replaceAll('ё', 'е').includes(q),
            ),
            nextCursor: null,
          });
        }),
      );
      return queries;
    }

    it('searches all months once typing pauses, marking what it found', async () => {
      mockAccount({ categories: [FOOD] });
      const queries = mockSearch();
      const { user, router } = renderApp('/?month=2026-04', {
        session: 'authenticated',
      });
      await screen.findByText('Яндекс Такси');

      await user.type(
        screen.getByRole('searchbox', { name: 'Поиск по комментариям' }),
        'пятерочка',
      );

      expect(
        await screen.findByText('Ищем во всех месяцах'),
      ).toBeInTheDocument();
      // The previous list stays until the results arrive.
      await waitForElementToBeRemoved(() => screen.queryByText('Яндекс Такси'));
      expect(screen.getByText('Пятёрочка').tagName).toBe('MARK');
      expect(router.state.location.search).toBe(
        '?month=2026-04&q=%D0%BF%D1%8F%D1%82%D0%B5%D1%80%D0%BE%D1%87%D0%BA%D0%B0',
      );
      // One request for the whole word, not one per letter; no period.
      const searches = queries.filter((q) => q.has('q'));
      expect(searches.map((q) => q.get('q'))).toEqual(['пятерочка']);
      expect(searches[0]?.has('from')).toBe(false);
    });

    it('waits for a second character', async () => {
      mockAccount({ categories: [FOOD] });
      const queries = mockSearch();
      const { user } = renderApp('/', { session: 'authenticated' });
      await screen.findByText('Яндекс Такси');

      await user.type(screen.getByRole('searchbox'), 'я');

      expect(
        await screen.findByText('Введите ещё хотя бы один символ'),
      ).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(queries.some((q) => q.has('q'))).toBe(false);
    });

    it('opens from a link and resets', async () => {
      mockAccount({ categories: [FOOD] });
      mockSearch();
      const { user, router } = renderApp('/?q=метро', {
        session: 'authenticated',
      });

      expect(await screen.findByRole('searchbox')).toHaveValue('метро');
      expect(await screen.findByText('Ничего не найдено')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Сбросить поиск' }));

      expect(await screen.findByText('Яндекс Такси')).toBeInTheDocument();
      expect(screen.getByRole('searchbox')).toHaveValue('');
      expect(router.state.location.search).toBe('');
    });
  });

  describe('a split transaction', () => {
    const HOME = {
      id: '0199d0a4-0000-7000-8000-00000000a0e1',
      kind: 'expense',
      name: 'Дом',
    } as const;
    const receipt = () =>
      transaction({
        amount: '2500.00',
        comment: 'Ашан',
        splits: [
          { category: FOOD, amount: '2000.00' },
          { category: HOME, amount: '500.00' },
        ],
      });

    it('names every category of its parts and the whole amount', async () => {
      mockAccount({ categories: [FOOD, HOME], transactions: [receipt()] });
      renderApp('/', { session: 'authenticated' });
      await screen.findByText('Ашан');

      expect(
        screen.getByRole('button', {
          name: /Продукты, Дом \(разделённая операция\).*Ашан.*−2\s500,00\s₽/,
        }),
      ).toBeInTheDocument();
    });

    it("shows a category's own part when the list is narrowed to it", async () => {
      mockAccount({ categories: [FOOD, HOME], transactions: [receipt()] });
      renderApp(`/?category=${HOME.id}`, { session: 'authenticated' });

      expect(
        await screen.findByRole('button', {
          name: /Часть от 2\s500,00\s₽ · Ашан.*−500,00\s₽/,
        }),
      ).toBeInTheDocument();
    });

    it('opens with its parts and saves them', async () => {
      const { sent } = mockAccount({
        categories: [FOOD, HOME],
        transactions: [receipt()],
      });
      const { user } = renderApp('/', { session: 'authenticated' });

      await user.click(await screen.findByText('Ашан'));
      const dialog = screen.getByRole('dialog', { name: 'Операция' });
      expect(within(dialog).getByLabelText('Категория части 1')).toHaveValue(
        FOOD.id,
      );
      expect(within(dialog).getByLabelText('Сумма части 2')).toHaveValue(
        '500,00',
      );

      const first = within(dialog).getByLabelText('Сумма части 1');
      await user.clear(first);
      await user.type(first, '1500');
      await user.clear(within(dialog).getByLabelText('Сумма'));
      await user.type(within(dialog).getByLabelText('Сумма'), '2000');
      await user.click(
        within(dialog).getByRole('button', { name: 'Сохранить' }),
      );

      expect(
        await screen.findByText('Изменения сохранены'),
      ).toBeInTheDocument();
      expect(sent.replacements).toEqual([
        expect.objectContaining({
          amount: '2000',
          splits: [
            { categoryId: FOOD.id, amount: '1500' },
            { categoryId: HOME.id, amount: '500.00' },
          ],
        }),
      ]);
    });
  });

  describe('tags', () => {
    const TRIP = { id: '0199d0a4-0000-7000-8000-0000000071a9', name: 'Отпуск' };

    it('shows the tags of a row', async () => {
      mockAccount({
        categories: [FOOD],
        tags: [TRIP],
        transactions: [transaction({ comment: 'Ужин', tags: [TRIP] })],
      });
      renderApp('/', { session: 'authenticated' });
      await screen.findByText('Ужин');

      expect(
        screen.getByRole('button', { name: /Ужин.*Теги: Отпуск/ }),
      ).toBeInTheDocument();
    });

    it('narrows the list to a tag over all months, with what it came to', async () => {
      mockAccount({
        categories: [FOOD],
        tags: [TRIP],
        summary: { income: '0.00', expense: '1700.00', balance: '-1700.00' },
      });
      const queries: URLSearchParams[] = [];
      server.use(
        http.get(apiUrl('/transactions'), ({ request }) => {
          queries.push(new URL(request.url).searchParams);
          return HttpResponse.json({ items: [], nextCursor: null });
        }),
      );
      const { user, router } = renderApp('/?month=2026-03', {
        session: 'authenticated',
      });
      await screen.findByRole('option', { name: TRIP.name });

      await user.selectOptions(screen.getByLabelText('Показать'), TRIP.name);

      expect(
        await screen.findByText(/«Отпуск» за всё время: расходы/),
      ).toHaveTextContent(/1\s700,00\s₽/);
      const last = queries.at(-1);
      expect(last?.get('tagId')).toBe(TRIP.id);
      expect(last?.has('from')).toBe(false);
      expect(router.state.location.search).toBe(
        `?month=2026-03&tag=${TRIP.id}`,
      );
    });

    it('measures what a tag came to against its budget', async () => {
      mockAccount({
        categories: [FOOD],
        tags: [
          {
            ...TRIP,
            budget: {
              limit: '3000.00',
              spent: '4000.00',
              remaining: '-1000.00',
            },
          },
        ],
        summary: { income: '0.00', expense: '4000.00', balance: '-4000.00' },
      });
      renderApp(`/?tag=${TRIP.id}`, { session: 'authenticated' });

      expect(
        await screen.findByText(/«Отпуск» за всё время: расходы/),
      ).toHaveTextContent(
        /расходы 4\s000,00\s₽ из 3\s000,00\s₽ · Перерасход 1\s000,00\s₽$/,
      );
    });
  });
});
