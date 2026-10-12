import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  type Category,
  transactionPageSchema,
  transactionSchema,
} from '@kopilka/shared';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Transactions (e2e)', () => {
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

  // Kind of every category the tests create: add() derives the type from it.
  const kinds = new Map<string, string>();

  const createCategory = async (user: TestUser, kind: string, name: string) => {
    const { body } = await http()
      .post('/api/categories')
      .set('Authorization', user.auth)
      .send({ kind, name })
      .expect(201);
    kinds.set(body.id, kind);
    return body as Category;
  };

  /**
   * A fresh user with one expense and one income category; `account` is
   * the main account every new user starts with.
   */
  async function setUp() {
    const user = await users.signUp();
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    const account = accounts.items[0] as { id: string; name: string };
    return {
      user: { ...user, accountId: account.id },
      account,
      food: await createCategory(user, 'expense', 'Продукты'),
      salary: await createCategory(user, 'income', 'Зарплата'),
    };
  }

  type Owner = TestUser & { accountId: string };

  /** POST a transaction; type and account default to the obvious ones. */
  const add = (user: Owner, body: Record<string, unknown>) =>
    http()
      .post('/api/transactions')
      .set('Authorization', user.auth)
      .send({
        type: kinds.get(body['categoryId'] as string),
        accountId: user.accountId,
        ...body,
      });

  const list = (user: TestUser, query: Record<string, string | number> = {}) =>
    http()
      .get('/api/transactions')
      .query(query)
      .set('Authorization', user.auth);

  describe('create', () => {
    it('accepts an amount as typed and stores it exactly', async () => {
      const { user, food } = await setUp();

      const res = await add(user, {
        categoryId: food.id,
        amount: '1 234,5',
        occurredAt: '2026-10-05T12:00:00.000Z',
        comment: '',
      }).expect(201);

      expect(transactionSchema.parse(res.body)).toMatchObject({
        amount: '1234.50',
        comment: null,
        category: food,
      });
      expect(res.body.occurredAt).toBe('2026-10-05T12:00:00.000Z');
    });

    it.each(['0', '-5', '1.234', 'abc', '10000000000000'])(
      'rejects amount %j',
      async (amount) => {
        const { user, food } = await setUp();

        const res = await add(user, {
          categoryId: food.id,
          amount,
          occurredAt: '2026-10-05T12:00:00Z',
        }).expect(400);

        expect(res.body.details.map((d: { field: string }) => d.field)).toEqual(
          ['amount'],
        );
      },
    );

    it("refuses another user's category at the database level", async () => {
      const alice = await setUp();
      const bob = await setUp();

      const res = await add(bob.user, {
        categoryId: alice.food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(400);

      expect(apiErrorSchema.parse(res.body)).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'categoryId', message: 'Категория не найдена' }],
      });
    });
  });

  describe('list', () => {
    it('pages through everything with a cursor: newest first, no gaps or repeats', async () => {
      const { user, food } = await setUp();
      // Two transactions share a timestamp: the id must break the tie.
      const times = [
        '2026-10-01T10:00:00Z',
        '2026-10-03T10:00:00Z',
        '2026-10-03T10:00:00Z',
        '2026-10-02T10:00:00Z',
        '2026-10-04T10:00:00Z',
      ];
      const created: string[] = [];
      for (const occurredAt of times) {
        const res = await add(user, {
          categoryId: food.id,
          amount: '1',
          occurredAt,
        }).expect(201);
        created.push(res.body.id);
      }

      const seen: { id: string; occurredAt: string }[] = [];
      const pageSizes: number[] = [];
      let cursor: string | null = null;
      do {
        const res = await list(user, { limit: 2, ...(cursor && { cursor }) });
        const page = transactionPageSchema.parse(res.body);
        pageSizes.push(page.items.length);
        seen.push(
          ...res.body.items.map((t: { id: string; occurredAt: string }) => ({
            id: t.id,
            occurredAt: t.occurredAt,
          })),
        );
        cursor = page.nextCursor;
      } while (cursor);

      expect(pageSizes).toEqual([2, 2, 1]);
      expect(seen.map((t) => t.id).sort()).toEqual([...created].sort());
      const expectedOrder = [...seen].sort(
        (a, b) =>
          b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
      );
      expect(seen).toEqual(expectedOrder);
    });

    it('filters by kind, category and period', async () => {
      const { user, food, salary } = await setUp();
      await add(user, {
        categoryId: food.id,
        amount: '10',
        occurredAt: '2026-09-30T23:00:00Z',
      });
      await add(user, {
        categoryId: food.id,
        amount: '20',
        occurredAt: '2026-10-10T10:00:00Z',
      });
      await add(user, {
        categoryId: salary.id,
        amount: '500',
        occurredAt: '2026-10-15T10:00:00Z',
      });

      const amounts = async (query: Record<string, string>) =>
        (await list(user, query).expect(200)).body.items.map(
          (t: { amount: string }) => t.amount,
        );

      expect(await amounts({ type: 'income' })).toEqual(['500.00']);
      expect(await amounts({ categoryId: food.id })).toEqual([
        '20.00',
        '10.00',
      ]);
      expect(
        await amounts({
          from: '2026-10-01T00:00:00Z',
          to: '2026-11-01T00:00:00Z',
        }),
      ).toEqual(['500.00', '20.00']);
    });

    describe('search by comment', () => {
      async function withComments() {
        const fixture = await setUp();
        const comments = [
          'Яндекс Такси',
          'Пятёрочка у дома',
          'Перекрёсток',
          'Кэшбэк 100% за кофе',
          'Кэшбэк 1005',
          null,
        ];
        for (const [index, comment] of comments.entries()) {
          await add(fixture.user, {
            categoryId: fixture.food.id,
            amount: String(index + 1),
            ...(comment && { comment }),
            occurredAt: `2026-10-0${index + 1}T12:00:00Z`,
          }).expect(201);
        }
        const search = async (q: string, extra: Record<string, string> = {}) =>
          (
            await list(fixture.user, { q, ...extra }).expect(200)
          ).body.items.map((t: { comment: string }) => t.comment);
        return { ...fixture, search };
      }

      it('finds a piece anywhere in the comment, whatever the case', async () => {
        const { search } = await withComments();
        expect(await search('такс')).toEqual(['Яндекс Такси']);
        expect(await search('ЯНДЕКС')).toEqual(['Яндекс Такси']);
        expect(await search('  у дом ')).toEqual(['Пятёрочка у дома']);
      });

      it('treats ё and е as the same letter, both ways', async () => {
        const { search } = await withComments();
        expect(await search('пятерочка')).toEqual(['Пятёрочка у дома']);
        expect(await search('перекресток')).toEqual(['Перекрёсток']);
        expect(await search('ПЯТЁР')).toEqual(['Пятёрочка у дома']);
      });

      it('takes % and _ literally', async () => {
        const { search } = await withComments();
        // As LIKE wildcards they would match "Кэшбэк 1005" too, or anything.
        expect(await search('100%')).toEqual(['Кэшбэк 100% за кофе']);
        expect(await search('__')).toEqual([]);
      });

      it('combines with the other filters and pages', async () => {
        const { search } = await withComments();
        expect(await search('кэшбэк', { limit: '1' })).toEqual(['Кэшбэк 1005']);
        expect(
          await search('кэшбэк', {
            from: '2026-10-04T00:00:00Z',
            to: '2026-10-05T00:00:00Z',
          }),
        ).toEqual(['Кэшбэк 100% за кофе']);
        const stranger = await setUp();
        expect(
          (await list(stranger.user, { q: 'такс' }).expect(200)).body.items,
        ).toEqual([]);
      });

      it('wants at least two characters', async () => {
        const { user } = await setUp();
        const res = await list(user, { q: ' я ' }).expect(400);
        expect(res.body.details).toEqual([
          { field: 'q', message: 'Введите хотя бы 2 символа' },
        ]);
      });
    });

    it('rejects a forged cursor', async () => {
      const { user } = await setUp();

      const res = await list(user, { cursor: 'not-a-cursor' }).expect(400);

      expect(res.body.details).toEqual([
        { field: 'cursor', message: 'Некорректный курсор' },
      ]);
    });

    it("never shows another user's transactions", async () => {
      const alice = await setUp();
      const bob = await setUp();
      await add(alice.user, {
        categoryId: alice.food.id,
        amount: '42',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      const res = await list(bob.user).expect(200);

      expect(res.body).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('summary', () => {
    it('sums exactly in the database', async () => {
      const { user, food, salary } = await setUp();
      // 0.1 + 0.2 in JS floats is 0.30000000000000004.
      await add(user, {
        categoryId: food.id,
        amount: '0.1',
        occurredAt: '2026-10-02T10:00:00Z',
      });
      await add(user, {
        categoryId: food.id,
        amount: '0.2',
        occurredAt: '2026-10-03T10:00:00Z',
      });
      await add(user, {
        categoryId: salary.id,
        amount: '1000',
        occurredAt: '2026-10-04T10:00:00Z',
      });
      await add(user, {
        categoryId: food.id,
        amount: '999',
        occurredAt: '2026-11-01T00:00:00Z',
      });

      const res = await http()
        .get('/api/transactions/summary')
        .query({ from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' })
        .set('Authorization', user.auth)
        .expect(200);

      expect(res.body).toEqual({
        income: '1000.00',
        expense: '0.30',
        balance: '999.70',
      });
    });

    it('is zero without transactions', async () => {
      const { user } = await setUp();

      const res = await http()
        .get('/api/transactions/summary')
        .set('Authorization', user.auth)
        .expect(200);

      expect(res.body).toEqual({
        income: '0.00',
        expense: '0.00',
        balance: '0.00',
      });
    });
  });

  describe('by category', () => {
    const byCategory = (user: TestUser, query: Record<string, string> = {}) =>
      http()
        .get('/api/transactions/by-category')
        .query(query)
        .set('Authorization', user.auth);

    it('sums each category of a kind over the period, largest first', async () => {
      const { user, food, salary } = await setUp();
      const cafe = await createCategory(user, 'expense', 'Кафе');
      for (const [categoryId, amount, occurredAt] of [
        [food.id, '0.1', '2026-10-02T10:00:00Z'],
        [food.id, '0.2', '2026-10-03T10:00:00Z'],
        [cafe.id, '500', '2026-10-04T10:00:00Z'],
        [salary.id, '1000', '2026-10-04T10:00:00Z'],
        // Outside the period.
        [food.id, '999', '2026-11-01T00:00:00Z'],
      ]) {
        await add(user, { categoryId, amount, occurredAt }).expect(201);
      }

      const res = await byCategory(user, {
        from: '2026-10-01T00:00:00Z',
        to: '2026-11-01T00:00:00Z',
      }).expect(200);

      expect(res.body).toEqual([
        { category: cafe, total: '500.00' },
        { category: food, total: '0.30' },
      ]);
    });

    it('breaks down income on request', async () => {
      const { user, food, salary } = await setUp();
      await add(user, {
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-02T10:00:00Z',
      }).expect(201);
      await add(user, {
        categoryId: salary.id,
        amount: '1000',
        occurredAt: '2026-10-02T10:00:00Z',
      }).expect(201);

      const res = await byCategory(user, { kind: 'income' }).expect(200);

      expect(res.body).toEqual([{ category: salary, total: '1000.00' }]);
    });

    it("does not count another user's transactions", async () => {
      const alice = await setUp();
      const bob = await setUp();
      await add(alice.user, {
        categoryId: alice.food.id,
        amount: '100',
        occurredAt: '2026-10-02T10:00:00Z',
      }).expect(201);

      const res = await byCategory(bob.user).expect(200);

      expect(res.body).toEqual([]);
    });

    it('rejects an unknown kind', async () => {
      const { user } = await setUp();

      await byCategory(user, { kind: 'transfer' }).expect(400);
    });
  });

  describe('category kind', () => {
    it('refuses a type that differs from the kind of the category', async () => {
      const { user, food } = await setUp();

      const res = await add(user, {
        type: 'income',
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(400);

      expect(res.body.details).toEqual([
        { field: 'categoryId', message: 'Это категория расходов' },
      ]);
    });
  });

  describe('transfers', () => {
    async function withSavings() {
      const fixture = await setUp();
      const { body: savings } = await http()
        .post('/api/accounts')
        .set('Authorization', fixture.user.auth)
        .send({ name: 'Вклад', type: 'savings' })
        .expect(201);
      return { ...fixture, savings };
    }

    const transfer = (user: Owner, toAccountId: string, amount = '300') =>
      add(user, {
        type: 'transfer',
        toAccountId,
        amount,
        occurredAt: '2026-10-05T12:00:00Z',
      });

    it('moves money between accounts without counting as income or expense', async () => {
      const { user, account, savings } = await withSavings();

      const res = await transfer(user, savings.id).expect(201);

      expect(transactionSchema.parse(res.body)).toMatchObject({
        type: 'transfer',
        amount: '300.00',
        account: { id: account.id, name: account.name, type: 'card' },
        toAccount: { id: savings.id, name: 'Вклад', type: 'savings' },
      });
      const summary = await http()
        .get('/api/transactions/summary')
        .set('Authorization', user.auth)
        .expect(200);
      expect(summary.body).toEqual({
        income: '0.00',
        expense: '0.00',
        balance: '0.00',
      });
    });

    it('shows a transfer on both of its accounts and under its own type', async () => {
      const { user, account, savings, food } = await withSavings();
      await transfer(user, savings.id).expect(201);
      await add(user, {
        categoryId: food.id,
        amount: '50',
        occurredAt: '2026-10-06T12:00:00Z',
      }).expect(201);

      const types = async (query: Record<string, string>) =>
        (await list(user, query).expect(200)).body.items.map(
          (t: { type: string }) => t.type,
        );

      expect(await types({ accountId: savings.id })).toEqual(['transfer']);
      expect(await types({ accountId: account.id })).toEqual([
        'expense',
        'transfer',
      ]);
      expect(await types({ type: 'transfer' })).toEqual(['transfer']);
    });

    it('refuses a transfer to the same account', async () => {
      const { user } = await setUp();

      const res = await transfer(user, user.accountId).expect(400);

      expect(res.body.details).toEqual([
        { field: 'toAccountId', message: 'Выберите другой счёт' },
      ]);
    });

    it("refuses another user's account on either side", async () => {
      const alice = await setUp();
      const bob = await setUp();

      const to = await transfer(bob.user, alice.user.accountId).expect(400);
      const from = await add(bob.user, {
        categoryId: bob.food.id,
        accountId: alice.user.accountId,
        amount: '1',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(400);

      expect(to.body.details).toEqual([
        { field: 'toAccountId', message: 'Счёт не найден' },
      ]);
      expect(from.body.details).toEqual([
        { field: 'accountId', message: 'Счёт не найден' },
      ]);
    });
  });

  describe('replace and delete', () => {
    const replace = (user: TestUser, id: string, body: object) =>
      http()
        .put(`/api/transactions/${id}`)
        .set('Authorization', user.auth)
        .send(body);

    it('replaces amount and category', async () => {
      const { user, food, salary } = await setUp();
      const { body: created } = await add(user, {
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      const res = await replace(user, created.id, {
        type: 'income',
        categoryId: salary.id,
        accountId: user.accountId,
        amount: '150,25',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(200);

      expect(res.body).toMatchObject({
        type: 'income',
        amount: '150.25',
        category: salary,
      });
    });

    it('turns an expense into a transfer', async () => {
      const { user, food } = await setUp();
      const { body: savings } = await http()
        .post('/api/accounts')
        .set('Authorization', user.auth)
        .send({ name: 'Вклад', type: 'savings' })
        .expect(201);
      const { body: created } = await add(user, {
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      const res = await replace(user, created.id, {
        type: 'transfer',
        accountId: user.accountId,
        toAccountId: savings.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(200);

      expect(res.body).toMatchObject({
        type: 'transfer',
        toAccount: { id: savings.id },
      });
      expect(res.body).not.toHaveProperty('category');
    });

    it("treats another user's transaction as missing", async () => {
      const alice = await setUp();
      const bob = await setUp();
      const { body: created } = await add(alice.user, {
        categoryId: alice.food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      await replace(bob.user, created.id, {
        type: 'expense',
        categoryId: bob.food.id,
        accountId: bob.user.accountId,
        amount: '1',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(404);
      await http()
        .delete(`/api/transactions/${created.id}`)
        .set('Authorization', bob.user.auth)
        .expect(404);

      const own = await list(alice.user).expect(200);
      expect(own.body.items[0]).toMatchObject({
        id: created.id,
        amount: '100.00',
      });
    });

    it('deletes a transaction', async () => {
      const { user, food } = await setUp();
      const { body: created } = await add(user, {
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      await http()
        .delete(`/api/transactions/${created.id}`)
        .set('Authorization', user.auth)
        .expect(204);

      expect((await list(user).expect(200)).body.items).toEqual([]);
    });
  });
});
