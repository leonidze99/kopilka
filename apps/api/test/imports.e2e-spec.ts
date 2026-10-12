import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type Import,
  importSchema,
  type Transaction,
  transactionPageSchema,
} from '@kopilka/shared';
import request from 'supertest';
import { MAX_FILE_BYTES } from '../src/imports/csv-upload.js';
import { ImportWorker } from '../src/imports/import.worker.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

/** Windows-1251, the way T-Bank exports: Cyrillic is one byte a letter. */
function cp1251(text: string): Buffer {
  // Code units are enough: everything here is in the Basic Multilingual Plane.
  return Buffer.from(
    Array.from({ length: text.length }, (_, index) => {
      const code = text.charCodeAt(index);
      if (code < 0x80) return code;
      if (code >= 0x410 && code <= 0x44f) return code - 0x410 + 0xc0;
      if (code === 0x401) return 0xa8; // Ё
      if (code === 0x451) return 0xb8; // ё
      throw new Error(`No ${text[index]} in the test encoder`);
    }),
  );
}

const TBANK_HEADERS = [
  'Дата операции',
  'Дата платежа',
  'Номер карты',
  'Статус',
  'Сумма операции',
  'Валюта операции',
  'Сумма платежа',
  'Валюта платежа',
  'Кэшбэк',
  'Категория',
  'MCC',
  'Описание',
  'Бонусы (включая кэшбэк)',
];

interface Row {
  at: string;
  amount: string;
  category?: string;
  description?: string;
  status?: string;
}

/** A T-Bank statement: quoted cells, ";", CRLF. */
function tbank(rows: Row[]): string {
  const line = (cells: string[]) => cells.map((c) => `"${c}"`).join(';');
  return [
    line(TBANK_HEADERS),
    ...rows.map((row) =>
      line([
        row.at,
        row.at.slice(0, 10),
        '*1234',
        row.status ?? 'OK',
        row.amount,
        'RUB',
        row.amount,
        'RUB',
        '',
        row.category ?? '',
        '5814',
        row.description ?? '',
        '0,00',
      ]),
    ),
  ].join('\r\n');
}

const coffee = (at = '05.10.2026 09:15:00'): Row => ({
  at,
  amount: '-250,00',
  category: 'Кафе',
  description: 'Кофейня',
});

const STATEMENT: Row[] = [
  {
    at: '01.10.2026 10:00:00',
    amount: '50 000,00',
    category: 'Зарплата',
    description: 'ООО Ромашка',
  },
  coffee(),
  // A second coffee at the very same minute: another transaction, not a duplicate.
  coffee(),
  {
    at: '06.10.2026 19:40:00',
    amount: '-1 840,50',
    category: 'Супермаркеты',
    description: 'Пятёрочка',
  },
  {
    at: '07.10.2026 12:00:00',
    amount: '-999,00',
    category: 'Супермаркеты',
    status: 'FAILED',
  },
  { at: 'вчера', amount: '-10,00' },
];

describe('Imports (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let worker: ImportWorker;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app);
    worker = app.get(ImportWorker);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function setUp() {
    const user = await users.signUp();
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    const category = async (kind: string, name: string) =>
      (
        await http()
          .post('/api/categories')
          .set('Authorization', user.auth)
          .send({ kind, name })
          .expect(201)
      ).body.id as string;
    return {
      user,
      accountId: accounts.items[0].id as string,
      // Same name as the bank's: suggested without asking.
      cafe: await category('expense', 'Кафе'),
      groceries: await category('expense', 'Продукты'),
      salary: await category('income', 'Зарплата'),
    };
  }

  const upload = (
    user: TestUser,
    content: Buffer | string,
    name = 'statement.csv',
  ) =>
    http()
      .post('/api/imports')
      .set('Authorization', user.auth)
      .attach('file', Buffer.from(content), name);

  const uploaded = async (user: TestUser, content: Buffer | string) =>
    importSchema.parse((await upload(user, content).expect(201)).body);

  const get = async (user: TestUser, id: string) =>
    importSchema.parse(
      (
        await http()
          .get(`/api/imports/${id}`)
          .set('Authorization', user.auth)
          .expect(200)
      ).body,
    );

  const map = (
    user: TestUser,
    imported: Import,
    accountId: string,
    columns = imported.columns,
  ) =>
    http()
      .put(`/api/imports/${imported.id}/mapping`)
      .set('Authorization', user.auth)
      .send({ accountId, timeZone: 'Europe/Moscow', columns });

  /** Uploaded, mapped and parsed: ready to commit. */
  async function ready(
    user: TestUser,
    content: Buffer | string,
    accountId: string,
  ) {
    const imported = await uploaded(user, content);
    await map(user, imported, accountId).expect(200);
    await worker.runPending();
    const result = await get(user, imported.id);
    expect(result.status).toBe('ready');
    return result;
  }

  /** Every new group to its suggested category, or to `fallback`. */
  const choices = (imported: Import, fallback: Record<string, string> = {}) =>
    imported.categories.map((group) => ({
      kind: group.kind,
      source: group.source,
      categoryId:
        group.category?.id ?? fallback[`${group.kind}:${group.source}`],
    }));

  const commit = (
    user: TestUser,
    id: string,
    categories: object[],
    skipLines?: number[],
  ) =>
    http()
      .post(`/api/imports/${id}/commit`)
      .set('Authorization', user.auth)
      .send({ categories, ...(skipLines && { skipLines }) });

  const transactions = async (user: TestUser): Promise<Transaction[]> =>
    transactionPageSchema.parse(
      (
        await http()
          .get('/api/transactions')
          .set('Authorization', user.auth)
          .expect(200)
      ).body,
    ).items;

  it('imports a T-Bank statement in Windows-1251', async () => {
    const { user, accountId, cafe, groceries, salary } = await setUp();

    const imported = await uploaded(user, cp1251(tbank(STATEMENT)));
    expect(imported).toMatchObject({
      status: 'uploaded',
      fileName: 'statement.csv',
      preset: 'tbank',
      headers: TBANK_HEADERS,
      totalRows: 6,
      account: null,
      columns: {
        date: 0,
        amount: { type: 'signed', column: 6 },
        category: 9,
        description: 11,
        status: { column: 3, value: 'OK' },
      },
    });
    expect(imported.sample[0]?.[11]).toBe('ООО Ромашка');

    await map(user, imported, accountId)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('parsing'));
    expect(await worker.runPending()).toBe(1);

    const parsed = await get(user, imported.id);
    expect(parsed).toMatchObject({
      status: 'ready',
      processed: 6,
      account: { id: accountId },
      counts: { new: 4, duplicate: 0, invalid: 1, skipped: 1, imported: 0 },
      errors: [{ line: 7, message: 'Не дата: «вчера»' }],
    });
    expect(parsed.categories).toEqual([
      expect.objectContaining({
        kind: 'expense',
        source: 'Кафе',
        rows: 2,
        total: '500.00',
        category: expect.objectContaining({ id: cafe }),
      }),
      expect.objectContaining({
        kind: 'income',
        source: 'Зарплата',
        rows: 1,
        total: '50000.00',
        category: expect.objectContaining({ id: salary }),
      }),
      expect.objectContaining({
        kind: 'expense',
        source: 'Супермаркеты',
        rows: 1,
        total: '1840.50',
        category: null,
      }),
    ]);

    await commit(
      user,
      imported.id,
      choices(parsed, { 'expense:Супермаркеты': groceries }),
    )
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('importing'));
    await worker.runPending();

    expect(await get(user, imported.id)).toMatchObject({
      status: 'done',
      counts: { new: 4, imported: 4 },
      // The staging rows are gone once imported.
      sample: [],
    });
    const items = await transactions(user);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      type: 'expense',
      amount: '1840.50',
      comment: 'Пятёрочка',
      category: { id: groceries },
      // 19:40 in Moscow.
      occurredAt: new Date('2026-10-06T16:40:00Z'),
    });
    expect(items.filter((t) => t.comment === 'Кофейня')).toHaveLength(2);
    expect(items.at(-1)).toMatchObject({ type: 'income', amount: '50000.00' });

    const { body: list } = await http()
      .get('/api/imports')
      .set('Authorization', user.auth)
      .expect(200);
    expect(list).toEqual([
      expect.objectContaining({
        id: imported.id,
        status: 'done',
        counts: expect.objectContaining({ imported: 4 }),
      }),
    ]);
  });

  it('skips what is already imported, and remembers the categories', async () => {
    const { user, accountId, groceries } = await setUp();
    const first = await ready(user, tbank(STATEMENT), accountId);
    await commit(
      user,
      first.id,
      choices(first, { 'expense:Супермаркеты': groceries }),
    ).expect(200);
    await worker.runPending();

    // The same statement again, in UTF-8 this time: nothing new.
    const again = await ready(user, tbank(STATEMENT), accountId);
    expect(again.counts).toMatchObject({ new: 0, duplicate: 4 });
    expect(again.categories).toEqual([]);

    // An overlapping statement: the old rows, a third coffee, a new day.
    const overlapping = await ready(
      user,
      tbank([
        ...STATEMENT,
        coffee(),
        {
          at: '08.10.2026 08:00:00',
          amount: '-75,00',
          category: 'Супермаркеты',
        },
      ]),
      accountId,
    );
    expect(overlapping.counts).toMatchObject({ new: 2, duplicate: 4 });
    // Супермаркеты → Продукты, as chosen on the first import.
    expect(overlapping.categories).toEqual([
      expect.objectContaining({ source: 'Кафе', rows: 1 }),
      expect.objectContaining({
        source: 'Супермаркеты',
        category: expect.objectContaining({ id: groceries }),
      }),
    ]);
    await commit(user, overlapping.id, choices(overlapping)).expect(200);
    await worker.runPending();
    expect(await transactions(user)).toHaveLength(6);

    // Another account is another history: the same rows are new there.
    const { body: card } = await http()
      .post('/api/accounts')
      .set('Authorization', user.auth)
      .send({ name: 'Вторая карта', type: 'card' })
      .expect(201);
    const elsewhere = await ready(user, tbank(STATEMENT), card.id);
    expect(elsewhere.counts).toMatchObject({ new: 4, duplicate: 0 });
  });

  it('imports the same statement once when two imports race', async () => {
    const { user, accountId, groceries } = await setUp();
    const fallback = { 'expense:Супермаркеты': groceries };
    const a = await ready(user, tbank(STATEMENT), accountId);
    const b = await ready(user, tbank(STATEMENT), accountId);
    // Both parsed before either imported: each thinks all four rows are new.
    expect(b.counts.new).toBe(4);
    await commit(user, a.id, choices(a, fallback)).expect(200);
    await commit(user, b.id, choices(b, fallback)).expect(200);

    // Two workers, one import each; the account lock puts them in a row.
    await Promise.all([worker.runPending(), worker.runPending()]);

    expect(await transactions(user)).toHaveLength(4);
    const results = await Promise.all([get(user, a.id), get(user, b.id)]);
    expect(results.map((r) => r.status)).toEqual(['done', 'done']);
    expect(results.map((r) => r.counts.imported).sort((x, y) => x - y)).toEqual(
      [0, 4],
    );
  });

  // Thousands of rows through upload, parsing and import, twice: seconds,
  // more with every other suite running alongside.
  it('numbers identical rows across batches', { timeout: 30_000 }, async () => {
    const { user, accountId, cafe } = await setUp();
    // 2500 identical coffees: three parse batches, all distinct.
    const coffees = Array.from({ length: 2500 }, () => coffee());
    const imported = await ready(user, tbank(coffees), accountId);
    expect(imported.counts.new).toBe(2500);
    await commit(user, imported.id, [
      { kind: 'expense', source: 'Кафе', categoryId: cafe },
    ]).expect(200);
    await worker.runPending();
    expect((await get(user, imported.id)).counts.imported).toBe(2500);

    // One more coffee in the next statement is the 2501st.
    const next = await ready(user, tbank([...coffees, coffee()]), accountId);
    expect(next.counts).toMatchObject({ new: 1, duplicate: 2500 });
  });

  describe('an account that must not go negative', () => {
    async function cash(user: TestUser) {
      const { body } = await http()
        .post('/api/accounts')
        .set('Authorization', user.auth)
        .send({
          name: 'Наличные',
          type: 'cash',
          openingBalance: '1000',
          allowNegative: false,
        })
        .expect(201);
      return body.id as string;
    }

    it('refuses a statement that would take it below zero', async () => {
      const { user, cafe } = await setUp();
      const accountId = await cash(user);
      const imported = await ready(
        user,
        tbank([{ ...coffee(), amount: '-1500,00' }]),
        accountId,
      );
      await commit(user, imported.id, [
        { kind: 'expense', source: 'Кафе', categoryId: cafe },
      ])
        .expect(409)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            code: 'INSUFFICIENT_FUNDS',
            details: [
              {
                field: 'categories',
                message: expect.stringContaining('не хватит 500,00'),
              },
            ],
          }),
        );
      expect((await get(user, imported.id)).status).toBe('ready');
    });

    it('rolls the whole import back when the money went meanwhile', async () => {
      const { user, cafe } = await setUp();
      const accountId = await cash(user);
      const imported = await ready(
        user,
        tbank([coffee('05.10.2026 09:00:00'), coffee('05.10.2026 10:00:00')]),
        accountId,
      );
      await commit(user, imported.id, [
        { kind: 'expense', source: 'Кафе', categoryId: cafe },
      ]).expect(200);
      // Between the confirmation and the worker: 600 of the 1000 spent.
      await http()
        .post('/api/transactions')
        .set('Authorization', user.auth)
        .send({
          type: 'expense',
          accountId,
          categoryId: cafe,
          amount: '600',
          occurredAt: new Date(),
        })
        .expect(201);

      await worker.runPending();

      // All or nothing: not even the first coffee, which still fitted.
      expect(await transactions(user)).toHaveLength(1);
      expect(await get(user, imported.id)).toMatchObject({
        status: 'ready',
        error: expect.stringContaining('не хватает 100,00'),
        counts: { new: 2, imported: 0 },
      });
    });
  });

  describe('the worker', () => {
    it('leaves a leased import alone until the lease runs out', async () => {
      const { user, accountId } = await setUp();
      const imported = await uploaded(user, tbank(STATEMENT));
      await map(user, imported, accountId).expect(200);
      // Another worker holds it.
      await prisma.import.update({
        where: { id: imported.id },
        data: { lockedUntil: new Date(Date.now() + 60_000) },
      });
      expect(await worker.runPending()).toBe(0);
      // ...and dies: the lease expires.
      await prisma.import.update({
        where: { id: imported.id },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      });
      expect(await worker.runPending()).toBe(1);
      expect((await get(user, imported.id)).status).toBe('ready');
    });

    it('gives up on an import that keeps failing', async () => {
      const { user, accountId } = await setUp();
      const imported = await uploaded(user, tbank(STATEMENT));
      await map(user, imported, accountId).expect(200);
      await prisma.import.update({
        where: { id: imported.id },
        data: { attempts: 3 },
      });
      await worker.runPending();
      expect(await get(user, imported.id)).toMatchObject({
        status: 'failed',
        error: 'Не удалось обработать файл',
      });
      // Other columns (or the same) start it over.
      await map(user, imported, accountId).expect(200);
      await worker.runPending();
      expect((await get(user, imported.id)).status).toBe('ready');
    });
  });

  describe('undo', () => {
    const undo = (user: TestUser, id: string) =>
      http().post(`/api/imports/${id}/undo`).set('Authorization', user.auth);

    it('deletes what the import made, edited or not, and lets the file in again', async () => {
      const { user, accountId, groceries, cafe } = await setUp();
      const first = await ready(user, tbank(STATEMENT), accountId);
      await commit(
        user,
        first.id,
        choices(first, { 'expense:Супермаркеты': groceries }),
      ).expect(200);
      await worker.runPending();
      // A manual transaction stays; an imported one gets a new category.
      await http()
        .post('/api/transactions')
        .set('Authorization', user.auth)
        .send({
          type: 'expense',
          accountId,
          categoryId: cafe,
          amount: '1',
          occurredAt: new Date(),
        })
        .expect(201);
      const [edited] = (await transactions(user)).filter(
        (t) => t.comment === 'Пятёрочка',
      );
      await http()
        .put(`/api/transactions/${edited?.id}`)
        .set('Authorization', user.auth)
        .send({
          type: 'expense',
          accountId,
          categoryId: cafe,
          amount: '1840.50',
          occurredAt: edited?.occurredAt,
          comment: 'Пятёрочка',
        })
        .expect(200);

      const { body } = await undo(user, first.id).expect(200);

      expect(importSchema.parse(body)).toMatchObject({
        status: 'undone',
        counts: { imported: 4, undone: 4 },
      });
      expect((await transactions(user)).map((t) => t.amount)).toEqual(['1.00']);
      // The fingerprints went with the rows: the same file is new again.
      const again = await ready(user, tbank(STATEMENT), accountId);
      expect(again.counts).toMatchObject({ new: 4, duplicate: 0 });
      // Undone, it may leave the history; a done one may not.
      await http()
        .delete(`/api/imports/${first.id}`)
        .set('Authorization', user.auth)
        .expect(204);
      await undo(user, again.id).expect(409);
    });

    it('refuses, deleting nothing, if an account would go below zero', async () => {
      const { user, salary } = await setUp();
      const { body: cash } = await http()
        .post('/api/accounts')
        .set('Authorization', user.auth)
        .send({ name: 'Наличные', type: 'cash', allowNegative: false })
        .expect(201);
      const imported = await ready(
        user,
        tbank([
          {
            at: '01.10.2026 10:00:00',
            amount: '1 000,00',
            category: 'Зарплата',
          },
        ]),
        cash.id,
      );
      await commit(user, imported.id, choices(imported)).expect(200);
      await worker.runPending();
      // Spent most of the imported income meanwhile.
      await http()
        .post('/api/transactions')
        .set('Authorization', user.auth)
        .send({
          type: 'income',
          accountId: cash.id,
          categoryId: salary,
          amount: '1',
          occurredAt: new Date(),
        })
        .expect(201);
      const { body: food } = await http()
        .post('/api/categories')
        .set('Authorization', user.auth)
        .send({ kind: 'expense', name: 'Еда' })
        .expect(201);
      await http()
        .post('/api/transactions')
        .set('Authorization', user.auth)
        .send({
          type: 'expense',
          accountId: cash.id,
          categoryId: food.id,
          amount: '800',
          occurredAt: new Date(),
        })
        .expect(201);

      await undo(user, imported.id)
        .expect(409)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            code: 'INSUFFICIENT_FUNDS',
            details: [
              { message: expect.stringContaining('не хватает 799,00') },
            ],
          }),
        );
      expect(await transactions(user)).toHaveLength(3);
      expect((await get(user, imported.id)).status).toBe('done');
    });
  });

  describe('possible duplicates', () => {
    const manual = (user: TestUser, body: object) =>
      http()
        .post('/api/transactions')
        .set('Authorization', user.auth)
        .send(body)
        .expect(201);

    it('pairs a row with a transaction entered by hand, one to one, and skips it on request', async () => {
      const { user, accountId, cafe, groceries } = await setUp();
      // Entered by hand: one coffee at lunch (09:15 Moscow in the file is
      // 06:15 UTC), a far older one, and one of another amount.
      await manual(user, {
        type: 'expense',
        accountId,
        categoryId: cafe,
        amount: '250',
        comment: 'Кофе',
        occurredAt: '2026-10-05T09:00:00Z',
      });
      await manual(user, {
        type: 'expense',
        accountId,
        categoryId: cafe,
        amount: '250',
        occurredAt: '2026-09-28T09:00:00Z',
      });
      await manual(user, {
        type: 'expense',
        accountId,
        categoryId: cafe,
        amount: '251',
        occurredAt: '2026-10-05T09:00:00Z',
      });
      // Money moved to savings by hand: the bank shows it as an expense.
      const { body: savings } = await http()
        .post('/api/accounts')
        .set('Authorization', user.auth)
        .send({ name: 'Вклад', type: 'savings' })
        .expect(201);
      await manual(user, {
        type: 'transfer',
        accountId,
        toAccountId: savings.id,
        amount: '15000',
        occurredAt: '2026-10-06T12:00:00Z',
      });

      const imported = await ready(
        user,
        tbank([
          ...STATEMENT,
          {
            at: '07.10.2026 09:00:00',
            amount: '-15 000,00',
            category: 'Переводы',
            description: 'На вклад',
          },
        ]),
        accountId,
      );

      // Two coffees in the file, one by hand: one pair, not two.
      expect(imported.possibleDuplicates).toEqual([
        expect.objectContaining({
          line: 3,
          amount: '250.00',
          kind: 'expense',
          similar: expect.objectContaining({ comment: 'Кофе', label: 'Кафе' }),
        }),
        expect.objectContaining({
          line: 8,
          amount: '15000.00',
          similar: expect.objectContaining({ label: 'Перевод' }),
        }),
      ]);

      // Both skipped: "Переводы" then needs no category.
      await commit(
        user,
        imported.id,
        choices(imported, { 'expense:Супермаркеты': groceries }).filter(
          (c) => c.source !== 'Переводы',
        ),
        [3, 8],
      ).expect(200);
      await worker.runPending();

      expect((await get(user, imported.id)).counts).toMatchObject({
        new: 3,
        imported: 3,
        skipped: 3,
      });
      expect(
        (await transactions(user)).filter((t) => t.comment === 'Кофейня'),
      ).toHaveLength(1);
    });
  });

  describe('refuses', () => {
    it('a request without a file', async () => {
      const user = await users.signUp();
      await http()
        .post('/api/imports')
        .set('Authorization', user.auth)
        .field('note', 'no file')
        .expect(400)
        .expect(({ body }) =>
          expect(body.details).toEqual([
            { field: 'file', message: 'Выберите файл' },
          ]),
        );
      await http()
        .post('/api/imports')
        .set('Authorization', user.auth)
        .send({ file: 'json' })
        .expect(400);
    });

    it('a file over the limit, while it is still arriving', async () => {
      const user = await users.signUp();
      // Long lines: the row and column limits must not trip first.
      const huge = Buffer.alloc(MAX_FILE_BYTES + 1024, `${'a'.repeat(1000)}\n`);
      await upload(user, huge)
        .expect(413)
        .expect(({ body }) => expect(body.details[0].field).toBe('file'));
      expect(
        await prisma.import.count({ where: { user: { email: user.email } } }),
      ).toBe(0);
    });

    it('files that are not statements', async () => {
      const user = await users.signUp();
      await upload(user, '"Дата;Сумма\n05.10.2026;1')
        .expect(400)
        .expect(({ body }) =>
          expect(body.details[0].message).toMatch(/Не удалось прочитать CSV/),
        );
      await upload(user, 'Дата;Сумма\n')
        .expect(400)
        .expect(({ body }) =>
          expect(body.details[0].message).toBe('В файле нет операций'),
        );
    });

    it('columns the file does not have, and other users', async () => {
      const { user, accountId } = await setUp();
      const imported = await uploaded(user, tbank(STATEMENT));
      const { columns } = imported;
      if (!columns) throw new Error('No columns suggested');
      await map(user, imported, accountId, {
        ...columns,
        amount: { type: 'signed', column: 40 },
      })
        .expect(400)
        .expect(({ body }) =>
          expect(body.details).toEqual([
            {
              field: 'columns.amount.column',
              message: 'В файле нет такой колонки',
            },
          ]),
        );

      const stranger = await setUp();
      await http()
        .get(`/api/imports/${imported.id}`)
        .set('Authorization', stranger.user.auth)
        .expect(404);
      await map(stranger.user, imported, stranger.accountId).expect(404);
      // Someone else's account is not an option either.
      await map(user, imported, stranger.accountId)
        .expect(400)
        .expect(({ body }) => expect(body.details[0].field).toBe('accountId'));
    });

    it('a commit that is early or leaves a group out', async () => {
      const { user, accountId, cafe, salary } = await setUp();
      const imported = await uploaded(user, tbank(STATEMENT));
      await commit(user, imported.id, []).expect(409);

      await map(user, imported, accountId).expect(200);
      await worker.runPending();
      await commit(user, imported.id, [
        { kind: 'expense', source: 'Кафе', categoryId: cafe },
      ])
        .expect(400)
        .expect(({ body }) => expect(body.details[0].field).toBe('categories'));
      await commit(user, imported.id, [
        { kind: 'expense', source: 'Кафе', categoryId: salary },
        { kind: 'expense', source: 'Супермаркеты', categoryId: cafe },
        { kind: 'income', source: 'Зарплата', categoryId: salary },
      ])
        .expect(400)
        .expect(({ body }) =>
          expect(body.details).toEqual([
            {
              field: 'categories.0.categoryId',
              message: 'Это категория доходов',
            },
          ]),
        );
    });

    it('discarding an import once it is done', async () => {
      const { user, accountId } = await setUp();
      const kept = await uploaded(user, tbank(STATEMENT));
      await http()
        .delete(`/api/imports/${kept.id}`)
        .set('Authorization', user.auth)
        .expect(204);
      await http()
        .get(`/api/imports/${kept.id}`)
        .set('Authorization', user.auth)
        .expect(404);

      const empty = await ready(
        user,
        tbank([{ ...coffee(), status: 'FAILED' }]),
        accountId,
      );
      await commit(user, empty.id, []).expect(200);
      await worker.runPending();
      expect((await get(user, empty.id)).status).toBe('done');
      await http()
        .delete(`/api/imports/${empty.id}`)
        .set('Authorization', user.auth)
        .expect(409);
    });
  });
});
