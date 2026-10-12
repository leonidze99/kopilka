import type { NestExpressApplication } from '@nestjs/platform-express';
import { recurringRuleSchema, transactionPageSchema } from '@kopilka/shared';
import request from 'supertest';
import { RecurringRunner } from '../src/recurring/recurring.runner.js';
import { addDays, addMonths, todayIn } from '../src/recurring/schedule.js';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Recurring payments (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let runner: RecurringRunner;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app);
    runner = app.get(RecurringRunner);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  /** Today in UTC: the zone of most rules below. */
  const today = () => todayIn('UTC', new Date());
  /** An instant on a UTC date. */
  const at = (date: string, time = '01:00:00') => new Date(`${date}T${time}Z`);

  async function setUp() {
    const user = await users.signUp();
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    const { body: rent } = await http()
      .post('/api/categories')
      .set('Authorization', user.auth)
      .send({ kind: 'expense', name: 'Жильё' })
      .expect(201);
    const { body: salary } = await http()
      .post('/api/categories')
      .set('Authorization', user.auth)
      .send({ kind: 'income', name: 'Зарплата' })
      .expect(201);
    return {
      user,
      accountId: accounts.items[0].id as string,
      rent: rent as { id: string },
      salary: salary as { id: string },
    };
  }

  const createRule = (user: TestUser, body: object) =>
    http().post('/api/recurring').set('Authorization', user.auth).send(body);

  const rules = async (user: TestUser) =>
    (
      await http()
        .get('/api/recurring')
        .set('Authorization', user.auth)
        .expect(200)
    ).body.map((rule: unknown) => recurringRuleSchema.parse(rule));

  const transactions = async (user: TestUser) =>
    transactionPageSchema.parse(
      (
        await http()
          .get('/api/transactions')
          .set('Authorization', user.auth)
          .expect(200)
      ).body,
    ).items;

  const rentRule = (
    fixture: Awaited<ReturnType<typeof setUp>>,
    extra: object = {},
  ) => ({
    type: 'expense',
    categoryId: fixture.rent.id,
    accountId: fixture.accountId,
    amount: '38000',
    comment: 'Аренда',
    startOn: today(),
    timeZone: 'UTC',
    ...extra,
  });

  it('makes a payment on its day, once, and moves to the next month', async () => {
    const fixture = await setUp();
    const { body: rule } = await createRule(
      fixture.user,
      rentRule(fixture),
    ).expect(201);
    expect(rule).toMatchObject({ nextOn: today(), lastError: null });

    await runner.runDue(at(today()));
    await runner.runDue(at(today(), '23:00:00'));

    const made = await transactions(fixture.user);
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({
      type: 'expense',
      amount: '38000.00',
      comment: 'Аренда',
      recurringRuleId: rule.id,
      // The start of the payment day in the rule's zone.
      occurredAt: new Date(`${today()}T00:00:00Z`),
    });
    expect((await rules(fixture.user))[0].nextOn).toBe(addMonths(today(), 1));
  });

  it('catches up the months it missed, each on its own date', async () => {
    const fixture = await setUp();
    await createRule(fixture.user, rentRule(fixture)).expect(201);

    await runner.runDue(at(addDays(addMonths(today(), 3), 1)));

    const dates = (await transactions(fixture.user)).map((t) =>
      t.occurredAt.toISOString().slice(0, 10),
    );
    expect(dates).toEqual(
      [3, 2, 1, 0].map((months) => addMonths(today(), months)),
    );
  });

  it("waits for the payment day to begin in the rule's zone", async () => {
    const fixture = await setUp();
    // UTC+14: tomorrow begins there at 10:00 UTC today.
    const tomorrow = addDays(today(), 1);
    await createRule(
      fixture.user,
      rentRule(fixture, { startOn: tomorrow, timeZone: 'Pacific/Kiritimati' }),
    ).expect(201);

    await runner.runDue(at(today(), '09:59:00'));
    expect(await transactions(fixture.user)).toHaveLength(0);

    await runner.runDue(at(today(), '10:00:00'));
    const [made] = await transactions(fixture.user);
    expect(made?.occurredAt).toEqual(at(today(), '10:00:00'));
  });

  it('skips a payment the account cannot afford, says why, and goes on', async () => {
    const fixture = await setUp();
    const { body: cash } = await http()
      .post('/api/accounts')
      .set('Authorization', fixture.user.auth)
      .send({
        name: 'Наличные',
        type: 'cash',
        openingBalance: '30000',
        allowNegative: false,
      })
      .expect(201);
    await createRule(
      fixture.user,
      rentRule(fixture, { accountId: cash.id }),
    ).expect(201);

    await runner.runDue(at(today()));

    expect(await transactions(fixture.user)).toHaveLength(0);
    const [rule] = await rules(fixture.user);
    expect(rule.nextOn).toBe(addMonths(today(), 1));
    expect(rule.lastError).toMatch(
      /: на счёте «Наличные» не хватило 8\s000,00\s₽$/,
    );

    // Money comes in; next month's payment goes through and clears the error.
    await http()
      .post('/api/transactions')
      .set('Authorization', fixture.user.auth)
      .send({
        type: 'income',
        categoryId: fixture.salary.id,
        accountId: cash.id,
        amount: '100000',
        occurredAt: at(today()).toISOString(),
      })
      .expect(201);
    await runner.runDue(at(addMonths(today(), 1)));

    expect(await transactions(fixture.user)).toHaveLength(2);
    expect((await rules(fixture.user))[0].lastError).toBeNull();
  });

  it('makes a transfer between accounts', async () => {
    const fixture = await setUp();
    const { body: savings } = await http()
      .post('/api/accounts')
      .set('Authorization', fixture.user.auth)
      .send({ name: 'Вклад', type: 'savings' })
      .expect(201);
    await createRule(fixture.user, {
      type: 'transfer',
      accountId: fixture.accountId,
      toAccountId: savings.id,
      amount: '5000',
      startOn: today(),
      timeZone: 'UTC',
    }).expect(201);

    await runner.runDue(at(today()));

    expect(await transactions(fixture.user)).toMatchObject([
      { type: 'transfer', toAccount: { id: savings.id }, amount: '5000.00' },
    ]);
  });

  it('restarts after the last payment made when the rule is replaced', async () => {
    const fixture = await setUp();
    const { body: rule } = await createRule(
      fixture.user,
      rentRule(fixture),
    ).expect(201);
    await runner.runDue(at(today()));

    const { body: replaced } = await http()
      .put(`/api/recurring/${rule.id}`)
      .set('Authorization', fixture.user.auth)
      .send(rentRule(fixture, { amount: '40000' }))
      .expect(200);
    await runner.runDue(at(today(), '23:00:00'));

    // Today's payment is not made a second time.
    expect(replaced.nextOn).toBe(addMonths(today(), 1));
    expect(await transactions(fixture.user)).toHaveLength(1);
  });

  it('makes each payment once with two runners at the same time', async () => {
    const fixture = await setUp();
    await createRule(fixture.user, rentRule(fixture)).expect(201);

    // SKIP LOCKED: the second runner passes the rule the first one holds.
    await Promise.all([
      runner.runDue(at(addMonths(today(), 2))),
      runner.runDue(at(addMonths(today(), 2))),
    ]);

    expect(await transactions(fixture.user)).toHaveLength(3);
  });

  it('makes nothing while paused', async () => {
    const fixture = await setUp();
    await createRule(fixture.user, rentRule(fixture, { active: false })).expect(
      201,
    );

    await runner.runDue(at(addMonths(today(), 1)));

    expect(await transactions(fixture.user)).toHaveLength(0);
  });

  it('keeps the transactions it made when the rule is deleted', async () => {
    const fixture = await setUp();
    const { body: rule } = await createRule(
      fixture.user,
      rentRule(fixture),
    ).expect(201);
    await runner.runDue(at(today()));

    await http()
      .delete(`/api/recurring/${rule.id}`)
      .set('Authorization', fixture.user.auth)
      .expect(204);

    expect(await transactions(fixture.user)).toMatchObject([
      { recurringRuleId: null, amount: '38000.00' },
    ]);
  });

  it('refuses a category of the other kind and accounts of another user', async () => {
    const alice = await setUp();
    const bob = await setUp();

    const kind = await createRule(
      alice.user,
      rentRule(alice, { type: 'income' }),
    ).expect(400);
    const account = await createRule(
      bob.user,
      rentRule(bob, { accountId: alice.accountId }),
    ).expect(400);

    expect(kind.body.details).toEqual([
      { field: 'categoryId', message: 'Это категория расходов' },
    ]);
    expect(account.body.details).toEqual([
      { field: 'accountId', message: 'Счёт не найден' },
    ]);
  });
});
