import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Schemas } from '@/shared/api';
import { API_URL } from '@/shared/config/env';
import { mockAccount } from '@/test/account';
import { apiError, apiUrl, FOOD, MAIN_ACCOUNT, SALARY } from '@/test/api';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

type Import = Schemas['Import'];
type Mapping = Schemas['ImportMappingRequest'];
type Commit = Schemas['ImportCommitRequest'];

const ID = '0199d0a4-4444-7000-8000-000000000001';

const TBANK_COLUMNS: Schemas['ImportColumns'] = {
  date: 0,
  dateOrder: 'dmy',
  amount: { type: 'signed', column: 2 },
  description: 4,
  category: 3,
  status: { column: 1, value: 'OK' },
};

const uploaded = (overrides: Partial<Import> = {}): Import => ({
  id: ID,
  fileName: 'tbank.csv',
  status: 'uploaded',
  createdAt: '2026-10-12T09:00:00.000Z',
  account: null,
  totalRows: 6,
  counts: { new: 0, duplicate: 0, invalid: 0, skipped: 0, imported: 0 },
  timeZone: null,
  headers: [
    'Дата операции',
    'Статус',
    'Сумма платежа',
    'Категория',
    'Описание',
  ],
  sample: [['05.10.2026 09:15:00', 'OK', '-250,00', 'Кафе', 'Кофейня']],
  preset: 'tbank',
  columns: TBANK_COLUMNS,
  processed: 0,
  errors: [],
  categories: [],
  error: null,
  ...overrides,
});

const accountRef = {
  id: MAIN_ACCOUNT.id,
  name: MAIN_ACCOUNT.name,
  type: 'card',
} as const;

/** What the server has once the six rows are parsed. */
const parsed = (current: Import): Import => ({
  ...current,
  status: 'ready',
  processed: 6,
  counts: { new: 4, duplicate: 0, invalid: 1, skipped: 1, imported: 0 },
  errors: [{ line: 7, message: 'Не дата: «вчера»' }],
  categories: [
    {
      kind: 'expense',
      source: 'Кафе',
      rows: 2,
      total: '500.00',
      category: null,
    },
    {
      kind: 'expense',
      source: 'Супермаркеты',
      rows: 1,
      total: '1840.50',
      category: FOOD,
    },
    {
      kind: 'income',
      source: 'Зарплата',
      rows: 1,
      total: '50000.00',
      category: SALARY,
    },
  ],
});

/**
 * The import API in memory. The server works in the background: every GET
 * of a busy import moves it one step on, as polling would see it.
 */
function mockImports(start: Import | null = null) {
  let current = start;
  const sent = {
    files: [] as string[],
    mappings: [] as Mapping[],
    commits: [] as Commit[],
  };

  const step = (value: Import): Import => {
    if (value.status === 'parsing') {
      return value.processed === 0 ? { ...value, processed: 3 } : parsed(value);
    }
    if (value.status === 'importing') {
      return value.processed === 0
        ? { ...value, processed: 2 }
        : {
            ...value,
            status: 'done',
            processed: 4,
            counts: { ...value.counts, imported: 4 },
            categories: [],
            sample: [],
          };
    }
    return value;
  };

  server.use(
    http.get(apiUrl('/imports'), () =>
      HttpResponse.json(current ? [current] : []),
    ),
    http.post(apiUrl('/imports'), async ({ request }) => {
      const file = (await request.formData()).get('file');
      sent.files.push(file instanceof File ? file.name : String(file));
      current = start ?? uploaded();
      return HttpResponse.json(current, { status: 201 });
    }),
    http.get(`${API_URL}/imports/:id`, () => {
      if (!current) return apiError(404, 'NOT_FOUND', 'Import not found');
      current = step(current);
      return HttpResponse.json(current);
    }),
    http.put(`${API_URL}/imports/:id/mapping`, async ({ request }) => {
      const body = (await request.json()) as Mapping;
      sent.mappings.push(body);
      current = {
        ...current!,
        status: 'parsing',
        processed: 0,
        account: accountRef,
        timeZone: body.timeZone,
      };
      return HttpResponse.json(current);
    }),
    http.post(`${API_URL}/imports/:id/commit`, async ({ request }) => {
      sent.commits.push((await request.json()) as Commit);
      current = { ...current!, status: 'importing', processed: 0 };
      return HttpResponse.json(current);
    }),
  );
  return sent;
}

/** Long enough for two polls, a second apart. */
const POLLED = { timeout: 4000 };

describe('ImportPage', () => {
  it(
    'takes a statement from the file to the transactions',
    { timeout: 15000 },
    async () => {
      const account = mockAccount({ categories: [FOOD, SALARY] });
      const sent = mockImports();
      const { user, router } = renderApp('/import', {
        session: 'authenticated',
      });

      expect(
        await screen.findByText('Импортов ещё не было'),
      ).toBeInTheDocument();
      await user.upload(
        screen.getByLabelText(/Выберите файл выписки/),
        new File(['"Дата операции";…'], 'tbank.csv', { type: 'text/csv' }),
      );

      // The columns of a recognised bank are filled in.
      expect(
        await screen.findByRole('heading', { level: 1, name: 'tbank.csv' }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe(`/import/${ID}`);
      expect(sent.files).toEqual(['tbank.csv']);
      expect(
        await screen.findByText(/Формат распознан: Т-Банк/),
      ).toBeInTheDocument();
      const preview = screen.getByRole('region', {
        name: 'Начало файла tbank.csv',
      });
      expect(
        within(preview).getByRole('columnheader', {
          name: /Сумма\s*Сумма платежа/,
        }),
      ).toBeInTheDocument();
      expect(
        await screen.findByRole('option', {
          name: MAIN_ACCOUNT.name,
          selected: true,
        }),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Разобрать файл' }));
      expect(sent.mappings).toEqual([
        {
          accountId: MAIN_ACCOUNT.id,
          timeZone: expect.any(String),
          columns: TBANK_COLUMNS,
        },
      ]);
      expect(
        await screen.findByRole('progressbar', {
          name: 'Разбираем строки файла',
        }),
      ).toBeInTheDocument();

      // Parsed: what is in the file, and a category for each bank one.
      const categories = await screen.findByRole(
        'list',
        { name: 'Категории из выписки' },
        POLLED,
      );
      expect(screen.getByText('Новых').nextSibling).toHaveTextContent('4');
      expect(
        screen.getByText('Строка 7: Не дата: «вчера»'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('combobox', { name: 'Категория для «Супермаркеты»' }),
      ).toHaveValue(FOOD.id);
      expect(
        screen.getByRole('combobox', { name: 'Категория для «Зарплата»' }),
      ).toHaveValue(SALARY.id);
      expect(
        within(categories).getByText(/Расход · 2 строки · 500,00/),
      ).toBeInTheDocument();
      // «Зарплата» exists: no second one to create.
      expect(
        within(
          screen.getByRole('combobox', { name: 'Категория для «Зарплата»' }),
        ).queryByRole('option', { name: /Новая категория/ }),
      ).not.toBeInTheDocument();

      // Nothing chosen for «Кафе»: asked for, nothing sent.
      await user.click(
        screen.getByRole('button', { name: 'Импортировать 4 операции' }),
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Выберите категорию',
      );
      expect(
        screen.getByRole('combobox', { name: 'Категория для «Кафе»' }),
      ).toBeInvalid();
      expect(sent.commits).toEqual([]);

      await user.selectOptions(
        screen.getByRole('combobox', { name: 'Категория для «Кафе»' }),
        '+ Новая категория «Кафе»',
      );
      await user.click(
        screen.getByRole('button', { name: 'Импортировать 4 операции' }),
      );

      expect(
        await screen.findByRole('progressbar', { name: 'Создаём операции' }),
      ).toBeInTheDocument();
      expect(account.sent.categories).toEqual([
        { kind: 'expense', name: 'Кафе' },
      ]);
      const cafe = account.state.categories.find((c) => c.name === 'Кафе');
      expect(sent.commits).toEqual([
        {
          categories: [
            { kind: 'expense', source: 'Кафе', categoryId: cafe?.id },
            { kind: 'expense', source: 'Супермаркеты', categoryId: FOOD.id },
            { kind: 'income', source: 'Зарплата', categoryId: SALARY.id },
          ],
        },
      ]);

      expect(
        await screen.findByText('Добавлено 4 операции', {}, POLLED),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'К операциям' })).toHaveAttribute(
        'href',
        `/?account=${MAIN_ACCOUNT.id}`,
      );
    },
  );

  it('says what is wrong with a file the API refuses', async () => {
    mockAccount();
    mockImports();
    server.use(
      http.post(apiUrl('/imports'), () =>
        apiError(400, 'VALIDATION_FAILED', 'Malformed CSV', [
          { field: 'file', message: 'Не удалось прочитать CSV (строка 3)' },
        ]),
      ),
    );
    const { user } = renderApp('/import', { session: 'authenticated' });
    await screen.findByText('Импортов ещё не было');

    await user.upload(
      screen.getByLabelText(/Выберите файл выписки/),
      new File(['x'], 'broken.csv'),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось прочитать CSV (строка 3)',
    );
  });

  it('asks for the columns of an unknown format', async () => {
    mockAccount();
    const sent = mockImports(uploaded({ preset: null, columns: null }));
    const { user } = renderApp(`/import/${ID}`, { session: 'authenticated' });

    await user.click(
      await screen.findByRole('button', { name: 'Разобрать файл' }),
    );

    expect(screen.queryByText(/Формат распознан/)).not.toBeInTheDocument();
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      'Выберите колонку',
      'Выберите колонку',
    ]);
    expect(
      screen.getByRole('combobox', { name: 'Колонка с датой' }),
    ).toBeInvalid();
    expect(sent.mappings).toEqual([]);
  });

  it('shows why the import was sent back', async () => {
    mockAccount({ categories: [FOOD, SALARY] });
    const ready = parsed(uploaded({ account: accountRef }));
    server.use(
      http.get(`${API_URL}/imports/:id`, () =>
        HttpResponse.json({
          ...ready,
          error: 'На счёте «Наличные» не хватает 100,00 ₽',
        }),
      ),
    );
    renderApp(`/import/${ID}`, { session: 'authenticated' });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'На счёте «Наличные» не хватает 100,00 ₽',
    );
  });
});
