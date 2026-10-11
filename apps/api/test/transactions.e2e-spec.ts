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

  /** A fresh user with one expense and one income category. */
  async function setUp() {
    const user = await users.signUp();
    const category = async (kind: string, name: string) =>
      (
        await http()
          .post('/categories')
          .set('Authorization', user.auth)
          .send({ kind, name })
          .expect(201)
      ).body as Category;
    return {
      user,
      food: await category('expense', 'Продукты'),
      salary: await category('income', 'Зарплата'),
    };
  }

  const add = (user: TestUser, body: object) =>
    http().post('/transactions').set('Authorization', user.auth).send(body);

  const list = (user: TestUser, query: Record<string, string | number> = {}) =>
    http().get('/transactions').query(query).set('Authorization', user.auth);

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

      expect(await amounts({ kind: 'income' })).toEqual(['500.00']);
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
        .get('/transactions/summary')
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
        .get('/transactions/summary')
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
        .get('/transactions/by-category')
        .query(query)
        .set('Authorization', user.auth);

    it('sums each category of a kind over the period, largest first', async () => {
      const { user, food, salary } = await setUp();
      const { body: cafe } = await http()
        .post('/categories')
        .set('Authorization', user.auth)
        .send({ kind: 'expense', name: 'Кафе' })
        .expect(201);
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

  describe('update and delete', () => {
    it('changes amount and category', async () => {
      const { user, food, salary } = await setUp();
      const { body: created } = await add(user, {
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      const res = await http()
        .patch(`/transactions/${created.id}`)
        .set('Authorization', user.auth)
        .send({ amount: '150,25', categoryId: salary.id })
        .expect(200);

      expect(res.body).toMatchObject({ amount: '150.25', category: salary });
    });

    it("treats another user's transaction as missing", async () => {
      const alice = await setUp();
      const bob = await setUp();
      const { body: created } = await add(alice.user, {
        categoryId: alice.food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      }).expect(201);

      await http()
        .patch(`/transactions/${created.id}`)
        .set('Authorization', bob.user.auth)
        .send({ amount: '1' })
        .expect(404);
      await http()
        .delete(`/transactions/${created.id}`)
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
        .delete(`/transactions/${created.id}`)
        .set('Authorization', user.auth)
        .expect(204);

      expect((await list(user).expect(200)).body.items).toEqual([]);
    });
  });
});
