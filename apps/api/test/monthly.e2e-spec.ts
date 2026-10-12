import type { NestExpressApplication } from '@nestjs/platform-express';
import { monthlyTotalsSchema } from '@kopilka/shared';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Monthly totals (e2e)', () => {
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
    const post = async (path: string, body: object) =>
      (
        await http()
          .post(`/api/${path}`)
          .set('Authorization', user.auth)
          .send(body)
          .expect(201)
      ).body as { id: string };
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    const accountId = accounts.items[0].id as string;
    const savings = await post('accounts', { name: 'Вклад', type: 'savings' });
    const salary = await post('categories', {
      kind: 'income',
      name: 'Зарплата',
    });
    const food = await post('categories', {
      kind: 'expense',
      name: 'Продукты',
    });
    const add = (
      type: string,
      amount: string,
      occurredAt: string,
      extra = {},
    ) =>
      post('transactions', {
        type,
        accountId,
        amount,
        occurredAt,
        ...(type === 'income' && { categoryId: salary.id }),
        ...(type === 'expense' && { categoryId: food.id }),
        ...(type === 'transfer' && { toAccountId: savings.id }),
        ...extra,
      });
    return { user, add };
  }

  const monthly = (user: TestUser, query: Record<string, string>) =>
    http()
      .get('/api/transactions/monthly')
      .query(query)
      .set('Authorization', user.auth);

  it('gives every month of the period, empty ones as zeros, without transfers', async () => {
    const { user, add } = await setUp();
    await add('income', '1000.10', '2026-09-05T12:00:00Z');
    await add('expense', '300.05', '2026-09-20T12:00:00Z');
    await add('expense', '50', '2026-11-02T12:00:00Z');
    // Moving money between one's own accounts is neither.
    await add('transfer', '500', '2026-11-03T12:00:00Z');

    const { body } = await monthly(user, {
      from: '2026-08',
      to: '2026-11',
      timeZone: 'UTC',
    }).expect(200);

    expect(monthlyTotalsSchema.parse(body)).toEqual([
      { month: '2026-08', income: '0.00', expense: '0.00', balance: '0.00' },
      {
        month: '2026-09',
        income: '1000.10',
        expense: '300.05',
        balance: '700.05',
      },
      { month: '2026-10', income: '0.00', expense: '0.00', balance: '0.00' },
      { month: '2026-11', income: '0.00', expense: '50.00', balance: '-50.00' },
    ]);
  });

  it("counts a transaction in the month of the user's time zone", async () => {
    const { user, add } = await setUp();
    // 00:30 on November 1st in Moscow, still October 31st in UTC.
    await add('expense', '100', '2026-10-31T21:30:00Z');

    const expenses = async (timeZone: string) =>
      monthlyTotalsSchema
        .parse(
          (
            await monthly(user, {
              from: '2026-10',
              to: '2026-11',
              timeZone,
            }).expect(200)
          ).body,
        )
        .map((m) => m.expense);

    expect(await expenses('Europe/Moscow')).toEqual(['0.00', '100.00']);
    expect(await expenses('UTC')).toEqual(['100.00', '0.00']);
  });

  it("does not count other users' transactions", async () => {
    const { add } = await setUp();
    await add('income', '999', '2026-09-05T12:00:00Z');
    const { user: other } = await setUp();

    const { body } = await monthly(other, {
      from: '2026-09',
      to: '2026-09',
      timeZone: 'UTC',
    }).expect(200);
    expect(body).toEqual([
      { month: '2026-09', income: '0.00', expense: '0.00', balance: '0.00' },
    ]);
  });

  it('refuses a period that is backwards, too long, or in an unknown zone', async () => {
    const { user } = await setUp();
    const fields = async (query: Record<string, string>) =>
      (await monthly(user, query).expect(400)).body.details.map(
        (d: { field: string }) => d.field,
      );

    expect(
      await fields({ from: '2026-10', to: '2026-01', timeZone: 'UTC' }),
    ).toEqual(['to']);
    expect(
      await fields({ from: '2023-01', to: '2026-01', timeZone: 'UTC' }),
    ).toEqual(['from']);
    expect(
      await fields({ from: '2026-01', to: '2026-13', timeZone: 'Mars/Base' }),
    ).toEqual(['to', 'timeZone']);
  });
});
