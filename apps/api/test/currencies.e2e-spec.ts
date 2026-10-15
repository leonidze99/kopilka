import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  type Account,
  accountListSchema,
  type Category,
  transactionSchema,
} from '@kopilka/shared';
import request from 'supertest';
import { CbrClient } from '../src/rates/cbr.client.js';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';
import { FakeCbr } from './utils/fake-cbr.js';

describe('Currencies (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  // USD 90, EUR 100, CNY 12.5, KZT 0.2 roubles, every day.
  const cbr = new FakeCbr();

  beforeAll(async () => {
    app = await createTestApp({
      overrides: [{ provide: CbrClient, useValue: cbr }],
    });
    users = testUsers(app);
  });

  afterEach(() => {
    cbr.down = false;
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const get = (user: TestUser, path: string, query: object = {}) =>
    http()
      .get(`/api/${path}`)
      .query(query)
      .set('Authorization', user.auth)
      .expect(200);

  const post = (user: TestUser, path: string, body: object) =>
    http().post(`/api/${path}`).set('Authorization', user.auth).send(body);

  /** A user with the main (rouble) account, a dollar card and a category. */
  async function setUp() {
    const user = await users.signUp();
    const { body: accounts } = await get(user, 'accounts');
    const { body: dollars } = await post(user, 'accounts', {
      name: 'Карта в долларах',
      type: 'card',
      currency: 'USD',
    }).expect(201);
    const { body: food } = await post(user, 'categories', {
      kind: 'expense',
      name: 'Продукты',
    }).expect(201);
    return {
      user,
      roubles: accounts.items[0] as Account,
      dollars: dollars as Account,
      food: food as Category,
    };
  }
  type Fixture = Awaited<ReturnType<typeof setUp>>;

  const expense = (
    { dollars, food }: Fixture,
    extra: object = {},
  ): Record<string, unknown> => ({
    type: 'expense',
    accountId: dollars.id,
    categoryId: food.id,
    amount: '10',
    occurredAt: '2026-10-05T12:00:00Z',
    ...extra,
  });

  const october = { from: '2026-10-01T00:00:00Z', to: '2026-11-01T00:00:00Z' };

  describe('accounts', () => {
    it('keeps an account in its currency, the base one by default', async () => {
      const { user, roubles, dollars } = await setUp();

      expect(roubles.currency).toBe('RUB');
      expect(dollars.currency).toBe('USD');
      const { body: me } = await get(user, 'auth/me');
      expect(me.baseCurrency).toBe('RUB');
    });

    it('totals the balances in the base currency at the latest rate', async () => {
      const fixture = await setUp();
      await http()
        .patch(`/api/accounts/${fixture.roubles.id}`)
        .set('Authorization', fixture.user.auth)
        .send({ openingBalance: '1000' })
        .expect(200);
      await http()
        .patch(`/api/accounts/${fixture.dollars.id}`)
        .set('Authorization', fixture.user.auth)
        .send({ openingBalance: '10.50' })
        .expect(200);

      const list = accountListSchema.parse(
        (await get(fixture.user, 'accounts')).body,
      );

      expect(list.items.map((a) => [a.currency, a.balance])).toEqual([
        ['RUB', '1000.00'],
        ['USD', '10.50'],
      ]);
      // 1000 + 10.50 × 90.
      expect(list.total).toBe('1945.00');
    });

    it('changes the currency only while nothing is in it', async () => {
      const fixture = await setUp();
      const change = (currency: string) =>
        http()
          .patch(`/api/accounts/${fixture.dollars.id}`)
          .set('Authorization', fixture.user.auth)
          .send({ currency });

      const { body: euros } = await change('EUR').expect(200);
      expect(euros.currency).toBe('EUR');

      await post(fixture.user, 'transactions', expense(fixture)).expect(201);
      const refused = await change('USD').expect(409);
      expect(refused.body.details).toEqual([
        {
          field: 'currency',
          message:
            'Валюту можно сменить, только пока у счёта нет операций и регулярных платежей',
        },
      ]);
    });
  });

  describe('transactions', () => {
    it('converts at the rate of the day of the transaction', async () => {
      const fixture = await setUp();
      // A day long ago: loaded from the Bank of Russia when needed.
      cbr.onDay.set('USD 2024-02-29', '80');

      const { body: then } = await post(
        fixture.user,
        'transactions',
        expense(fixture, { occurredAt: '2024-02-29T12:00:00Z' }),
      ).expect(201);
      const { body: now } = await post(
        fixture.user,
        'transactions',
        expense(fixture),
      ).expect(201);

      expect(transactionSchema.parse(then)).toMatchObject({
        amount: '10.00',
        baseAmount: '800.00',
        baseAmountManual: false,
        account: { currency: 'USD' },
      });
      expect(now.baseAmount).toBe('900.00');
      expect(cbr.requests).toContain('USD 2024-02-15..2024-02-29');
    });

    it('takes the amount in the base currency as given, the bank’s rate', async () => {
      const fixture = await setUp();

      const { body } = await post(
        fixture.user,
        'transactions',
        expense(fixture, { baseAmount: '925.50' }),
      ).expect(201);

      expect(body).toMatchObject({
        baseAmount: '925.50',
        baseAmountManual: true,
      });
      const summary = await get(fixture.user, 'transactions/summary', october);
      expect(summary.body.expense).toBe('925.50');
    });

    it('ignores an amount by hand on an account in the base currency', async () => {
      const fixture = await setUp();

      const { body } = await post(
        fixture.user,
        'transactions',
        expense(fixture, {
          accountId: fixture.roubles.id,
          amount: '500',
          baseAmount: '1',
        }),
      ).expect(201);

      expect(body).toMatchObject({
        baseAmount: '500.00',
        baseAmountManual: false,
      });
    });

    it('says the rate is missing, and takes the amount by hand instead', async () => {
      const fixture = await setUp();
      cbr.down = true;
      const old = expense(fixture, { occurredAt: '2023-05-10T12:00:00Z' });

      const refused = await post(fixture.user, 'transactions', old).expect(409);
      const byHand = await post(fixture.user, 'transactions', {
        ...old,
        baseAmount: '820',
      }).expect(201);

      expect(refused.body).toMatchObject({
        code: 'EXCHANGE_RATE_UNAVAILABLE',
        details: [{ field: 'baseAmount' }],
      });
      expect(byHand.body.baseAmount).toBe('820.00');
    });

    it('counts totals, categories, tags and budgets in the base currency', async () => {
      const fixture = await setUp();
      await http()
        .put(`/api/budgets/${fixture.food.id}`)
        .set('Authorization', fixture.user.auth)
        .send({ month: '2026-10', amount: '1000' })
        .expect(204);
      await post(
        fixture.user,
        'transactions',
        expense(fixture, { tags: ['Поездка'] }),
      ).expect(201);
      await post(
        fixture.user,
        'transactions',
        expense(fixture, { accountId: fixture.roubles.id, amount: '300' }),
      ).expect(201);

      const summary = await get(fixture.user, 'transactions/summary', october);
      const byCategory = await get(
        fixture.user,
        'transactions/by-category',
        october,
      );
      const byTag = await get(fixture.user, 'transactions/by-tag', october);
      const budgets = await get(fixture.user, 'budgets', {
        month: '2026-10',
        ...october,
      });

      expect(summary.body.expense).toBe('1200.00');
      expect(byCategory.body[0].total).toBe('1200.00');
      expect(byTag.body[0].total).toBe('900.00');
      expect(budgets.body.items[0]).toMatchObject({
        spent: '1200.00',
        remaining: '-200.00',
      });
    });

    it('splits the base amount between the parts', async () => {
      const fixture = await setUp();
      const { body: home } = await post(fixture.user, 'categories', {
        kind: 'expense',
        name: 'Дом',
      }).expect(201);

      await post(fixture.user, 'transactions', {
        type: 'expense',
        accountId: fixture.dollars.id,
        amount: '10',
        occurredAt: '2026-10-05T12:00:00Z',
        baseAmount: '1000',
        splits: [
          { categoryId: fixture.food.id, amount: '7' },
          { categoryId: home.id, amount: '3' },
        ],
      }).expect(201);

      const byCategory = await get(
        fixture.user,
        'transactions/by-category',
        october,
      );
      expect(
        byCategory.body.map((row: { total: string }) => row.total),
      ).toEqual(['700.00', '300.00']);
    });
  });

  describe('transfers', () => {
    const transfer = (fixture: Fixture, extra: object = {}) => ({
      type: 'transfer',
      accountId: fixture.roubles.id,
      toAccountId: fixture.dollars.id,
      amount: '9250',
      occurredAt: '2026-10-05T12:00:00Z',
      ...extra,
    });

    it('needs what arrived between two currencies', async () => {
      const fixture = await setUp();

      const refused = await post(
        fixture.user,
        'transactions',
        transfer(fixture),
      ).expect(400);
      const { body } = await post(
        fixture.user,
        'transactions',
        transfer(fixture, { toAmount: '100' }),
      ).expect(201);

      expect(refused.body.details).toEqual([
        { field: 'toAmount', message: 'Укажите, сколько пришло на счёт' },
      ]);
      expect(body).toMatchObject({ amount: '9250.00', toAmount: '100.00' });
      const { body: accounts } = await get(fixture.user, 'accounts');
      expect(
        accounts.items.map((a: Account) => [a.currency, a.balance]),
      ).toEqual([
        ['RUB', '-9250.00'],
        ['USD', '100.00'],
      ]);
      // Moving one's own money is neither income nor expense.
      const summary = await get(fixture.user, 'transactions/summary', october);
      expect(summary.body).toMatchObject({ income: '0.00', expense: '0.00' });
    });

    it('moves the same amount between accounts of one currency', async () => {
      const fixture = await setUp();
      const { body: cash } = await post(fixture.user, 'accounts', {
        name: 'Наличные',
        type: 'cash',
      }).expect(201);

      const { body } = await post(
        fixture.user,
        'transactions',
        transfer(fixture, { toAccountId: cash.id, toAmount: '1' }),
      ).expect(201);

      expect(body.toAmount).toBe('9250.00');
    });

    it('is not made recurring between two currencies', async () => {
      const fixture = await setUp();

      const res = await post(fixture.user, 'recurring', {
        type: 'transfer',
        accountId: fixture.roubles.id,
        toAccountId: fixture.dollars.id,
        amount: '9000',
        startOn: '2026-11-01',
        timeZone: 'UTC',
      }).expect(400);

      expect(res.body.details).toEqual([
        {
          field: 'toAccountId',
          message: 'Регулярный перевод — только между счетами в одной валюте',
        },
      ]);
    });
  });

  describe('base currency', () => {
    it('converts transactions at their days and limits at today’s rate', async () => {
      const fixture = await setUp();
      cbr.onDay.set('USD 2024-03-01', '75');
      await http()
        .put(`/api/budgets/${fixture.food.id}`)
        .set('Authorization', fixture.user.auth)
        .send({ month: '2026-10', amount: '9000' })
        .expect(204);
      // 900 roubles on a day when a dollar was 75: 12 dollars.
      await post(
        fixture.user,
        'transactions',
        expense(fixture, {
          accountId: fixture.roubles.id,
          amount: '900',
          occurredAt: '2024-03-01T12:00:00Z',
          tags: ['Отпуск'],
        }),
      ).expect(201);
      // A dollar expense with an amount given by hand in roubles.
      await post(
        fixture.user,
        'transactions',
        expense(fixture, { baseAmount: '1000' }),
      ).expect(201);
      const { body: tags } = await get(fixture.user, 'tags');
      await http()
        .put(`/api/tags/${tags[0].id}/budget`)
        .set('Authorization', fixture.user.auth)
        .send({ amount: '1800' })
        .expect(204);

      const { body: me } = await http()
        .put('/api/auth/base-currency')
        .set('Authorization', fixture.user.auth)
        .send({ baseCurrency: 'USD' })
        .expect(200);

      expect(me.baseCurrency).toBe('USD');
      const { body: feed } = await get(fixture.user, 'transactions');
      expect(
        feed.items.map(
          (t: { baseAmount: string; baseAmountManual: boolean }) => [
            t.baseAmount,
            t.baseAmountManual,
          ],
        ),
      ).toEqual([
        // In dollars it is what it is, nothing by hand any more.
        ['10.00', false],
        ['12.00', false],
      ]);
      const budgets = await get(fixture.user, 'budgets', {
        month: '2026-10',
        ...october,
      });
      // 9000 roubles at 90.
      expect(budgets.body.items[0]).toMatchObject({
        limit: '100.00',
        spent: '10.00',
      });
      const { body: tagged } = await get(fixture.user, 'tags');
      expect(tagged[0].budget).toEqual({
        limit: '20.00',
        spent: '12.00',
        remaining: '8.00',
      });
      const { body: accounts } = await get(fixture.user, 'accounts');
      // Balances stay in their currencies; the total is in dollars now.
      expect(accounts.items.map((a: Account) => a.balance)).toEqual([
        '-900.00',
        '-10.00',
      ]);
      expect(accounts.total).toBe('-20.00');
    });

    it('changes nothing when a rate is missing', async () => {
      const fixture = await setUp();
      await post(
        fixture.user,
        'transactions',
        expense(fixture, {
          accountId: fixture.roubles.id,
          occurredAt: '2023-06-15T12:00:00Z',
        }),
      ).expect(201);
      cbr.down = true;

      const res = await http()
        .put('/api/auth/base-currency')
        .set('Authorization', fixture.user.auth)
        .send({ baseCurrency: 'CNY' })
        .expect(409);

      expect(res.body.code).toBe('EXCHANGE_RATE_UNAVAILABLE');
      const { body: me } = await get(fixture.user, 'auth/me');
      expect(me.baseCurrency).toBe('RUB');
    });
  });
});
