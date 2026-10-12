import type { NestExpressApplication } from '@nestjs/platform-express';
import { budgetListSchema } from '@kopilka/shared';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Budgets (e2e)', () => {
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

  async function setUp() {
    const user = await users.signUp();
    const category = async (kind: string, name: string) =>
      (
        await http()
          .post('/api/categories')
          .set('Authorization', user.auth)
          .send({ kind, name })
          .expect(201)
      ).body as { id: string; kind: string; name: string };
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    return {
      user,
      accountId: accounts.items[0].id as string,
      food: await category('expense', 'Продукты'),
      cafe: await category('expense', 'Кафе'),
      salary: await category('income', 'Зарплата'),
    };
  }

  const setBudget = (
    user: TestUser,
    categoryId: string,
    month: string,
    amount: string | null,
  ) =>
    http()
      .put(`/api/budgets/${categoryId}`)
      .set('Authorization', user.auth)
      .send({ month, amount });

  /** Bounds in UTC: the tests do not depend on the machine's zone. */
  const budgets = async (user: TestUser, month: string) => {
    const [year, index] = month.split('-').map(Number) as [number, number];
    const res = await http()
      .get('/api/budgets')
      .query({
        month,
        from: new Date(Date.UTC(year, index - 1, 1)).toISOString(),
        to: new Date(Date.UTC(year, index, 1)).toISOString(),
      })
      .set('Authorization', user.auth)
      .expect(200);
    return budgetListSchema.parse(res.body);
  };

  const limits = async (user: TestUser, month: string) =>
    (await budgets(user, month)).items.map((item) => [
      item.category.name,
      item.limit,
      item.since,
    ]);

  it('applies a limit from its month until the next change', async () => {
    const { user, food } = await setUp();
    await setBudget(user, food.id, '2026-10', '10 000').expect(204);
    await setBudget(user, food.id, '2026-12', '15000').expect(204);

    expect(await limits(user, '2026-09')).toEqual([]);
    expect(await limits(user, '2026-10')).toEqual([
      ['Продукты', '10000.00', '2026-10'],
    ]);
    expect(await limits(user, '2026-11')).toEqual([
      ['Продукты', '10000.00', '2026-10'],
    ]);
    expect(await limits(user, '2027-01')).toEqual([
      ['Продукты', '15000.00', '2026-12'],
    ]);
  });

  it('stops a budget from a month without touching the months before', async () => {
    const { user, food } = await setUp();
    await setBudget(user, food.id, '2026-10', '10000').expect(204);

    await setBudget(user, food.id, '2026-11', null).expect(204);

    expect(await limits(user, '2026-10')).toHaveLength(1);
    expect(await limits(user, '2026-11')).toEqual([]);
  });

  it('keeps one version per month: setting it again replaces it', async () => {
    const { user, food } = await setUp();
    await setBudget(user, food.id, '2026-10', '100').expect(204);

    await setBudget(user, food.id, '2026-10', '200').expect(204);

    expect(await limits(user, '2026-10')).toEqual([
      ['Продукты', '200.00', '2026-10'],
    ]);
  });

  it('compares the limit with what was spent in the month, exactly', async () => {
    const { user, accountId, food, cafe } = await setUp();
    await setBudget(user, food.id, '2026-10', '1000').expect(204);
    await setBudget(user, cafe.id, '2026-10', '300').expect(204);
    for (const [categoryId, amount, occurredAt] of [
      [food.id, '0.1', '2026-10-02T10:00:00Z'],
      [food.id, '0.2', '2026-10-03T10:00:00Z'],
      [cafe.id, '450', '2026-10-04T10:00:00Z'],
      // Another month.
      [food.id, '999', '2026-11-01T00:00:00Z'],
    ]) {
      await http()
        .post('/api/transactions')
        .set('Authorization', user.auth)
        .send({ type: 'expense', accountId, categoryId, amount, occurredAt })
        .expect(201);
    }

    const october = await budgets(user, '2026-10');

    expect(
      october.items.map(({ category, spent, remaining }) => [
        category.name,
        spent,
        remaining,
      ]),
    ).toEqual([
      // Over the limit: remaining goes negative.
      ['Кафе', '450.00', '-150.00'],
      ['Продукты', '0.30', '999.70'],
    ]);
    expect(october.total).toEqual({
      limit: '1300.00',
      spent: '450.30',
      remaining: '849.70',
    });
  });

  it('refuses a budget for an income category', async () => {
    const { user, salary } = await setUp();

    const res = await setBudget(user, salary.id, '2026-10', '100').expect(400);

    expect(res.body.details).toEqual([
      { message: 'Бюджет задаётся только для категорий расходов' },
    ]);
  });

  it("treats another user's category as missing", async () => {
    const alice = await setUp();
    const bob = await setUp();

    await setBudget(bob.user, alice.food.id, '2026-10', '100').expect(404);
    expect(await limits(alice.user, '2026-10')).toEqual([]);
  });

  it('rejects a malformed month', async () => {
    const { user, food } = await setUp();

    const res = await setBudget(user, food.id, '2026-13', '100').expect(400);

    expect(res.body.details).toEqual([
      { field: 'month', message: 'Месяц в формате ГГГГ-ММ' },
    ]);
  });

  it('goes away with its category', async () => {
    const { user, food } = await setUp();
    await setBudget(user, food.id, '2026-10', '100').expect(204);

    await http()
      .delete(`/api/categories/${food.id}`)
      .set('Authorization', user.auth)
      .expect(204);

    expect(await limits(user, '2026-10')).toEqual([]);
  });
});
