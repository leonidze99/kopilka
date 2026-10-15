import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  budgetListSchema,
  type Category,
  transactionPageSchema,
  transactionSchema,
} from '@kopilka/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Split transactions (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const createCategory = async (user: TestUser, kind: string, name: string) => {
    const { body } = await http()
      .post('/api/categories')
      .set('Authorization', user.auth)
      .send({ kind, name })
      .expect(201);
    return body as Category;
  };

  /** A user with two expense categories, an income one and their account. */
  async function setUp() {
    const user = await users.signUp();
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    return {
      user,
      accountId: (accounts.items[0] as { id: string }).id,
      food: await createCategory(user, 'expense', 'Продукты'),
      home: await createCategory(user, 'expense', 'Дом'),
      salary: await createCategory(user, 'income', 'Зарплата'),
    };
  }
  type Fixture = Awaited<ReturnType<typeof setUp>>;

  const OCTOBER = { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' };

  /** A 2500 receipt: 2000 of groceries, 500 of household goods. */
  const receipt = ({ accountId, food, home }: Fixture) => ({
    type: 'expense',
    accountId,
    amount: '2500',
    occurredAt: '2026-10-05T12:00:00Z',
    comment: 'Ашан',
    splits: [
      { categoryId: home.id, amount: '500' },
      { categoryId: food.id, amount: '2000' },
    ],
  });

  const add = (user: TestUser, body: object) =>
    http().post('/api/transactions').set('Authorization', user.auth).send(body);

  const replace = (user: TestUser, id: string, body: object) =>
    http()
      .put(`/api/transactions/${id}`)
      .set('Authorization', user.auth)
      .send(body);

  const get = (user: TestUser, path: string, query: object = {}) =>
    http()
      .get(`/api/${path}`)
      .query(query)
      .set('Authorization', user.auth)
      .expect(200);

  describe('create', () => {
    it('stores the parts, largest first, and no category of its own', async () => {
      const fixture = await setUp();

      const res = await add(fixture.user, receipt(fixture)).expect(201);

      expect(transactionSchema.parse(res.body)).toMatchObject({
        type: 'expense',
        amount: '2500.00',
        category: null,
        splits: [
          { category: fixture.food, amount: '2000.00' },
          { category: fixture.home, amount: '500.00' },
        ],
      });
    });

    it('gives a plain transaction no parts', async () => {
      const { user, accountId, food } = await setUp();

      const res = await add(user, {
        type: 'expense',
        accountId,
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      expect(res.body).toMatchObject({ category: food, splits: [] });
    });

    it('refuses parts that do not add up to the amount', async () => {
      const fixture = await setUp();

      const res = await add(fixture.user, {
        ...receipt(fixture),
        amount: '2700',
      }).expect(400);

      expect(res.body.details).toEqual([
        {
          field: 'splits',
          message: 'Части меньше суммы операции на 200,00',
        },
      ]);
    });

    it.each([
      [
        'a single part',
        (f: Fixture) => [{ categoryId: f.food.id, amount: '2500' }],
        'splits',
      ],
      [
        'one category twice',
        (f: Fixture) => [
          { categoryId: f.food.id, amount: '2000' },
          { categoryId: f.food.id, amount: '500' },
        ],
        'splits.1.categoryId',
      ],
    ])('refuses %s', async (_, splits, field) => {
      const fixture = await setUp();

      const res = await add(fixture.user, {
        ...receipt(fixture),
        splits: splits(fixture),
      }).expect(400);

      expect(res.body.details).toEqual([expect.objectContaining({ field })]);
    });

    it('refuses a part in a category of the other kind', async () => {
      const fixture = await setUp();

      const res = await add(fixture.user, {
        ...receipt(fixture),
        splits: [
          { categoryId: fixture.food.id, amount: '2000' },
          { categoryId: fixture.salary.id, amount: '500' },
        ],
      }).expect(400);

      expect(res.body.details).toEqual([
        { field: 'splits.1.categoryId', message: 'Это категория доходов' },
      ]);
    });

    it("refuses a part in another user's category", async () => {
      const fixture = await setUp();
      const stranger = await setUp();

      const res = await add(fixture.user, {
        ...receipt(fixture),
        splits: [
          { categoryId: fixture.food.id, amount: '2000' },
          { categoryId: stranger.home.id, amount: '500' },
        ],
      }).expect(400);

      expect(res.body.details).toEqual([
        { field: 'splits.1.categoryId', message: 'Категория не найдена' },
      ]);
    });
  });

  describe('totals', () => {
    it('counts each part in its category, the transaction once', async () => {
      const fixture = await setUp();
      await add(fixture.user, receipt(fixture)).expect(201);

      const byCategory = await get(
        fixture.user,
        'transactions/by-category',
        OCTOBER,
      );
      const summary = await get(fixture.user, 'transactions/summary', OCTOBER);
      const monthly = await get(fixture.user, 'transactions/monthly', {
        from: '2026-10',
        to: '2026-10',
        timeZone: 'UTC',
      });

      expect(byCategory.body).toEqual([
        { category: fixture.food, total: '2000.00' },
        { category: fixture.home, total: '500.00' },
      ]);
      expect(summary.body).toEqual({
        income: '0.00',
        expense: '2500.00',
        balance: '-2500.00',
      });
      expect(monthly.body).toEqual([
        {
          month: '2026-10',
          income: '0.00',
          expense: '2500.00',
          balance: '-2500.00',
        },
      ]);
    });

    it('spends a budget with the part in its category', async () => {
      const fixture = await setUp();
      await http()
        .put(`/api/budgets/${fixture.home.id}`)
        .set('Authorization', fixture.user.auth)
        .send({ month: '2026-10', amount: '1000' })
        .expect(204);
      await add(fixture.user, receipt(fixture)).expect(201);

      const res = await get(fixture.user, 'budgets', {
        month: '2026-10',
        ...OCTOBER,
      });

      expect(budgetListSchema.parse(res.body).items).toEqual([
        expect.objectContaining({ spent: '500.00', remaining: '500.00' }),
      ]);
    });

    it('takes the whole amount off the account', async () => {
      const fixture = await setUp();
      await add(fixture.user, receipt(fixture)).expect(201);

      const res = await get(fixture.user, 'accounts');

      expect(res.body.total).toBe('-2500.00');
    });
  });

  describe('feed', () => {
    it('finds a split transaction by the category of any part', async () => {
      const fixture = await setUp();
      const { body: split } = await add(fixture.user, receipt(fixture));

      const byHome = await get(fixture.user, 'transactions', {
        categoryId: fixture.home.id,
      });
      const bySalary = await get(fixture.user, 'transactions', {
        categoryId: fixture.salary.id,
      });
      const expenses = await get(fixture.user, 'transactions', {
        type: 'expense',
      });
      const income = await get(fixture.user, 'transactions', {
        type: 'income',
      });

      const ids = (body: unknown) =>
        transactionPageSchema.parse(body).items.map((item) => item.id);
      expect(ids(byHome.body)).toEqual([split.id]);
      expect(ids(bySalary.body)).toEqual([]);
      expect(ids(expenses.body)).toEqual([split.id]);
      expect(ids(income.body)).toEqual([]);
    });

    it('exports a line per part', async () => {
      const fixture = await setUp();
      await add(fixture.user, receipt(fixture)).expect(201);

      const res = await http()
        .get('/api/transactions/export?timeZone=UTC')
        .set('Authorization', fixture.user.auth)
        .expect(200);

      expect(res.text.replace('﻿', '').trim().split('\r\n').slice(1)).toEqual([
        '05.10.2026 12:00;Расход;Продукты;Основной счёт;;2000,00;RUB;Ашан;',
        '05.10.2026 12:00;Расход;Дом;Основной счёт;;500,00;RUB;Ашан;',
      ]);
    });
  });

  describe('replace and delete', () => {
    it('joins the parts back into one category, and splits again', async () => {
      const fixture = await setUp();
      const { body: split } = await add(fixture.user, receipt(fixture));

      const joined = await replace(fixture.user, split.id, {
        ...receipt(fixture),
        splits: undefined,
        categoryId: fixture.food.id,
      }).expect(200);
      expect(joined.body).toMatchObject({ category: fixture.food, splits: [] });

      const again = await replace(fixture.user, split.id, {
        ...receipt(fixture),
        amount: '3000',
        splits: [
          { categoryId: fixture.food.id, amount: '1000' },
          { categoryId: fixture.home.id, amount: '2000' },
        ],
      }).expect(200);
      expect(again.body).toMatchObject({
        amount: '3000.00',
        category: null,
        splits: [
          { category: fixture.home, amount: '2000.00' },
          { category: fixture.food, amount: '1000.00' },
        ],
      });
    });

    it('turns a split transaction into a transfer', async () => {
      const fixture = await setUp();
      const { body: savings } = await http()
        .post('/api/accounts')
        .set('Authorization', fixture.user.auth)
        .send({ name: 'Вклад', type: 'savings' })
        .expect(201);
      const { body: split } = await add(fixture.user, receipt(fixture));

      const res = await replace(fixture.user, split.id, {
        type: 'transfer',
        accountId: fixture.accountId,
        toAccountId: savings.id,
        amount: '2500',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(200);

      expect(res.body).toMatchObject({ type: 'transfer' });
      const byFood = await get(
        fixture.user,
        'transactions/by-category',
        OCTOBER,
      );
      expect(byFood.body).toEqual([]);
    });

    it('keeps a category with parts in it', async () => {
      const fixture = await setUp();
      await add(fixture.user, receipt(fixture)).expect(201);

      const res = await http()
        .delete(`/api/categories/${fixture.home.id}`)
        .set('Authorization', fixture.user.auth)
        .expect(409);

      expect(res.body.code).toBe('CATEGORY_IN_USE');
    });

    it('deletes the parts with the transaction', async () => {
      const fixture = await setUp();
      const { body: split } = await add(fixture.user, receipt(fixture));

      await http()
        .delete(`/api/transactions/${split.id}`)
        .set('Authorization', fixture.user.auth)
        .expect(204);

      // The category is free again.
      await http()
        .delete(`/api/categories/${fixture.home.id}`)
        .set('Authorization', fixture.user.auth)
        .expect(204);
    });
  });

  /**
   * The service never writes these; the trigger is what stops a bug in
   * some other path (a seed, a script, a future feature) from writing them.
   */
  describe('database', () => {
    const write = async (
      fixture: Fixture,
      parts: { categoryId: string; amount: string }[],
    ) => {
      const prisma = app.get(PrismaService);
      await prisma.$transaction(async (tx) => {
        const { id } = await tx.transaction.create({
          data: {
            userId: fixture.user.id,
            accountId: fixture.accountId,
            amount: '2500',
            occurredAt: new Date('2026-10-05T12:00:00Z'),
          },
        });
        await tx.transactionSplit.createMany({
          data: parts.map((part) => ({
            transactionId: id,
            userId: fixture.user.id,
            ...part,
          })),
        });
      });
    };

    it('takes parts that add up, checked at commit', async () => {
      const fixture = await setUp();

      await write(fixture, [
        { categoryId: fixture.food.id, amount: '2000' },
        { categoryId: fixture.home.id, amount: '500' },
      ]);
    });

    it.each([
      ['parts that do not add up', '400'],
      ['no parts at all', null],
    ])('refuses %s', async (_, homeAmount) => {
      const fixture = await setUp();

      await expect(
        write(
          fixture,
          homeAmount === null
            ? []
            : [
                { categoryId: fixture.food.id, amount: '2000' },
                { categoryId: fixture.home.id, amount: homeAmount },
              ],
        ),
      ).rejects.toThrow(/transaction_splits_total_check|adding up/);
    });
  });
});
