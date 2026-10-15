import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Account, accountSchema, apiErrorSchema } from '@kopilka/shared';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Accounts (e2e)', () => {
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

  const accounts = async (user: TestUser) =>
    (
      await http()
        .get('/api/accounts')
        .set('Authorization', user.auth)
        .expect(200)
    ).body.items as Account[];

  const balanceOf = async (user: TestUser, id: string) =>
    (await accounts(user)).find((account) => account.id === id)?.balance;

  const createAccount = (user: TestUser, body: object) =>
    http().post('/api/accounts').set('Authorization', user.auth).send(body);

  const createCategory = async (user: TestUser, kind: string) =>
    (
      await http()
        .post('/api/categories')
        .set('Authorization', user.auth)
        .send({ kind, name: kind === 'income' ? 'Зарплата' : 'Продукты' })
        .expect(201)
    ).body as { id: string };

  /** A user with categories and an account of the given settings. */
  async function setUp(account: object) {
    const user = await users.signUp();
    const { body } = await createAccount(user, {
      name: 'Наличные',
      type: 'cash',
      ...account,
    }).expect(201);
    return {
      user,
      account: body as Account,
      food: await createCategory(user, 'expense'),
      salary: await createCategory(user, 'income'),
    };
  }

  const record = (
    user: TestUser,
    accountId: string,
    category: { id: string },
    type: 'income' | 'expense',
    amount: string,
  ) =>
    http().post('/api/transactions').set('Authorization', user.auth).send({
      type,
      categoryId: category.id,
      accountId,
      amount,
      occurredAt: '2026-10-05T12:00:00Z',
    });

  it('gives a new user a main account', async () => {
    const user = await users.signUp();

    expect(await accounts(user)).toEqual([
      {
        id: expect.any(String),
        name: 'Основной счёт',
        type: 'card',
        currency: 'RUB',
        openingBalance: '0.00',
        allowNegative: true,
        balance: '0.00',
      },
    ]);
  });

  it('computes the balance from the opening balance and every movement', async () => {
    const { user, account, food, salary } = await setUp({
      openingBalance: '1 000,10',
    });
    const [main] = await accounts(user);
    await record(user, account.id, salary, 'income', '0.1').expect(201);
    await record(user, account.id, food, 'expense', '0.3').expect(201);
    // 250 out to the main account, 100 back.
    for (const [from, to, amount] of [
      [account.id, main!.id, '250'],
      [main!.id, account.id, '100'],
    ] as const) {
      await http()
        .post('/api/transactions')
        .set('Authorization', user.auth)
        .send({
          type: 'transfer',
          accountId: from,
          toAccountId: to,
          amount,
          occurredAt: '2026-10-05T12:00:00Z',
        })
        .expect(201);
    }

    // 1000.10 + 0.10 - 0.30 - 250 + 100: exact, summed in numeric.
    expect(accountSchema.parse((await accounts(user))[1])).toMatchObject({
      openingBalance: '1000.10',
      balance: '849.90',
    });
    expect(await balanceOf(user, main!.id)).toBe('150.00');
    // Transfers move money inside: the total is opening + income - expense.
    const { body } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    expect(body.total).toBe('999.90');
  });

  it('refuses a duplicate name', async () => {
    const { user } = await setUp({});

    const res = await createAccount(user, {
      name: 'Наличные',
      type: 'cash',
    }).expect(409);

    expect(res.body.details).toEqual([
      { field: 'name', message: 'Счёт с таким названием уже есть' },
    ]);
  });

  it("treats another user's account as missing", async () => {
    const alice = await setUp({});
    const bob = await users.signUp();

    await http()
      .patch(`/api/accounts/${alice.account.id}`)
      .set('Authorization', bob.auth)
      .send({ name: 'Моё' })
      .expect(404);
    await http()
      .delete(`/api/accounts/${alice.account.id}`)
      .set('Authorization', bob.auth)
      .expect(404);
  });

  it('deletes only an account without transactions', async () => {
    const { user, account, food } = await setUp({});
    const { body: empty } = await createAccount(user, {
      name: 'Пустой',
      type: 'card',
    }).expect(201);
    await record(user, account.id, food, 'expense', '10').expect(201);

    const inUse = await http()
      .delete(`/api/accounts/${account.id}`)
      .set('Authorization', user.auth)
      .expect(409);
    await http()
      .delete(`/api/accounts/${empty.id}`)
      .set('Authorization', user.auth)
      .expect(204);

    expect(apiErrorSchema.parse(inUse.body).code).toBe('ACCOUNT_IN_USE');
  });

  describe('an account that must not go negative', () => {
    it('refuses an expense beyond the balance and keeps the balance', async () => {
      const { user, account, food } = await setUp({
        openingBalance: '1000',
        allowNegative: false,
      });
      await record(user, account.id, food, 'expense', '600').expect(201);

      const res = await record(user, account.id, food, 'expense', '600').expect(
        409,
      );

      expect(apiErrorSchema.parse(res.body)).toMatchObject({
        code: 'INSUFFICIENT_FUNDS',
        details: [
          {
            field: 'amount',
            // Intl puts a no-break space before the currency sign.
            message: expect.stringMatching(
              /^На счёте «Наличные» не хватает 200,00\s₽$/,
            ),
          },
        ],
      });
      expect(await balanceOf(user, account.id)).toBe('400.00');
    });

    it('refuses to delete an income the balance relies on', async () => {
      const { user, account, food, salary } = await setUp({
        allowNegative: false,
      });
      const { body: income } = await record(
        user,
        account.id,
        salary,
        'income',
        '500',
      ).expect(201);
      await record(user, account.id, food, 'expense', '400').expect(201);

      const res = await http()
        .delete(`/api/transactions/${income.id}`)
        .set('Authorization', user.auth)
        .expect(409);

      expect(res.body.code).toBe('INSUFFICIENT_FUNDS');
      expect(await balanceOf(user, account.id)).toBe('100.00');
    });

    it('refuses to turn the limit on while below zero', async () => {
      const { user, account, food } = await setUp({});
      await record(user, account.id, food, 'expense', '10').expect(201);

      const res = await http()
        .patch(`/api/accounts/${account.id}`)
        .set('Authorization', user.auth)
        .send({ allowNegative: false })
        .expect(409);

      expect(res.body.details).toEqual([
        {
          field: 'allowNegative',
          message: expect.stringMatching(
            /^На счёте «Наличные» не хватает 10,00\s₽$/,
          ),
        },
      ]);
    });

    it('refuses a negative opening balance', async () => {
      const user = await users.signUp();

      const res = await createAccount(user, {
        name: 'Наличные',
        type: 'cash',
        openingBalance: '-1',
        allowNegative: false,
      }).expect(400);

      expect(res.body.details).toEqual([
        {
          field: 'openingBalance',
          message:
            'Отрицательный остаток — только у счёта, которому можно в минус',
        },
      ]);
    });

    /**
     * The race the account lock exists for. Each request alone sees enough
     * money; without the lock, concurrent ones all read the balance before
     * any of them commits, all pass the check, and the account ends up
     * well below zero (write skew).
     */
    it('lets concurrent expenses through only while there is money', async () => {
      const { user, account, food } = await setUp({
        openingBalance: '1000',
        allowNegative: false,
      });

      const statuses = await Promise.all(
        Array.from({ length: 10 }, () =>
          record(user, account.id, food, 'expense', '300').then(
            (res) => res.status,
          ),
        ),
      );

      expect(statuses.filter((status) => status === 201)).toHaveLength(3);
      expect(statuses.filter((status) => status === 409)).toHaveLength(7);
      expect(await balanceOf(user, account.id)).toBe('100.00');
    });
  });
});
