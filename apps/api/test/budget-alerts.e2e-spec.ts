import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { BudgetAlertsService } from '../src/budgets/budget-alerts.service.js';
import { MailerService } from '../src/mail/mailer.service.js';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';
import { FakeMailer } from './utils/fake-mailer.js';

describe('Budget alerts (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let alerts: BudgetAlertsService;
  let mailer: FakeMailer;

  beforeAll(async () => {
    mailer = new FakeMailer();
    app = await createTestApp({
      overrides: [{ provide: MailerService, useValue: mailer }],
    });
    users = testUsers(app);
    alerts = app.get(BudgetAlertsService);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Intl groups thousands with a no-break space; read them as plain ones. */
  const plain = (text = '') => text.split(String.fromCharCode(160)).join(' ');

  // A month of its own per test: the job looks at "now" in the user's zone.
  const NOW = new Date('2026-10-20T10:00:00Z');
  const MONTH = '2026-10';

  async function setUp() {
    const user = await users.signUp();
    const auth = { Authorization: user.auth };
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set(auth)
      .expect(200);
    const { body: food } = await http()
      .post('/api/categories')
      .set(auth)
      .send({ kind: 'expense', name: 'Продукты' })
      .expect(201);
    await http()
      .put(`/api/budgets/${food.id}`)
      .set(auth)
      .send({ month: MONTH, amount: '30000' })
      .expect(204);
    return {
      user,
      auth,
      accountId: accounts.items[0].id as string,
      food: food as { id: string; name: string },
    };
  }

  const spend = (
    fixture: Awaited<ReturnType<typeof setUp>>,
    amount: string,
    occurredAt = `${MONTH}-15T12:00:00.000Z`,
  ) =>
    http()
      .post('/api/transactions')
      .set(fixture.auth)
      .send({
        type: 'expense',
        categoryId: fixture.food.id,
        accountId: fixture.accountId,
        amount,
        occurredAt,
      })
      .expect(201);

  /** Only this user's budgets: the suites share one database. */
  const run = (fixture: { user: TestUser }, now = NOW) =>
    alerts.run(now, { userId: fixture.user.id });

  it('mails once when the month passes the limit, with the numbers', async () => {
    const fixture = await setUp();
    await spend(fixture, '32500');

    expect(await run(fixture)).toBe(1);

    const [mail] = mailer.to(fixture.user.email);
    expect(mail?.subject).toBe('Бюджет «Продукты» на октябрь превышен');
    expect(plain(mail?.text)).toContain('32 500,00');
    expect(plain(mail?.text)).toContain('30 000,00');
    // How much over, so the letter answers the question it raises.
    expect(plain(mail?.text)).toContain('2 500,00');

    // Every hour after that: the same overspend is not news.
    await spend(fixture, '100');
    expect(await run(fixture)).toBe(0);
    expect(mailer.to(fixture.user.email)).toHaveLength(1);
  });

  it('says nothing while the budget holds', async () => {
    const fixture = await setUp();
    await spend(fixture, '29999.99');

    expect(await run(fixture)).toBe(0);
    expect(mailer.to(fixture.user.email)).toHaveLength(0);
  });

  it('counts only the month it is about', async () => {
    const fixture = await setUp();
    // Last month's spending, over the limit, but not this month's.
    await spend(fixture, '50000', '2026-09-15T12:00:00.000Z');

    expect(await run(fixture)).toBe(0);
  });

  it('writes again next month, once it is overspent too', async () => {
    const fixture = await setUp();
    await spend(fixture, '31000');
    expect(await run(fixture)).toBe(1);

    await http()
      .put(`/api/budgets/${fixture.food.id}`)
      .set(fixture.auth)
      .send({ month: '2026-11', amount: '30000' })
      .expect(204);
    await spend(fixture, '40000', '2026-11-03T12:00:00.000Z');

    // The key is (category, month): November is a letter of its own.
    expect(await run(fixture, new Date('2026-11-20T10:00:00Z'))).toBe(1);
    expect(mailer.to(fixture.user.email)).toHaveLength(2);
    expect(mailer.to(fixture.user.email)[1]?.subject).toContain('на ноябрь');
  });

  it('leaves alone a user who turned the letters off', async () => {
    const fixture = await setUp();
    await spend(fixture, '31000');

    const { body: user } = await http()
      .put('/api/auth/notifications')
      .set(fixture.auth)
      .send({ budgetAlerts: false })
      .expect(200);
    expect(user).toMatchObject({ budgetAlerts: false });

    expect(await run(fixture)).toBe(0);
    expect(mailer.to(fixture.user.email)).toHaveLength(0);
  });

  describe('tag budgets', () => {
    /** An expense of the fixture with the tag "Отпуск"; under the category limit. */
    const spendOnTrip = (
      fixture: Awaited<ReturnType<typeof setUp>>,
      amount: string,
      occurredAt = `${MONTH}-15T12:00:00.000Z`,
    ) =>
      http()
        .post('/api/transactions')
        .set(fixture.auth)
        .send({
          type: 'expense',
          categoryId: fixture.food.id,
          accountId: fixture.accountId,
          amount,
          occurredAt,
          tags: ['Отпуск'],
        })
        .expect(201);

    const tripBudget = async (
      fixture: Awaited<ReturnType<typeof setUp>>,
      amount: string | null,
    ) => {
      const { body: tags } = await http()
        .get('/api/tags')
        .set(fixture.auth)
        .expect(200);
      const trip = (tags as { id: string; name: string }[]).find(
        (tag) => tag.name === 'Отпуск',
      )!;
      await http()
        .put(`/api/tags/${trip.id}/budget`)
        .set(fixture.auth)
        .send({ amount })
        .expect(204);
      return trip.id;
    };

    it('mails once when a tag passes its budget, over all its months', async () => {
      const fixture = await setUp();
      await spendOnTrip(fixture, '3000');
      // Another year: a tag budget has no months.
      await spendOnTrip(fixture, '2600', '2025-07-01T12:00:00.000Z');
      const tagId = await tripBudget(fixture, '5000');

      expect(await run(fixture)).toBe(1);

      const [mail] = mailer.to(fixture.user.email);
      expect(mail?.subject).toBe('Бюджет тега «Отпуск» превышен');
      expect(plain(mail?.text)).toContain('Потрачено 5 600,00');
      expect(plain(mail?.text)).toContain('из 5 000,00');
      expect(plain(mail?.text)).toContain('на 600,00');
      // The link opens the tag's transactions.
      expect(mail?.text).toContain(`/?tag=${tagId}`);

      await spendOnTrip(fixture, '100');
      expect(await run(fixture)).toBe(0);
      expect(mailer.to(fixture.user.email)).toHaveLength(1);
    });

    it('writes again once a raised limit is passed too', async () => {
      const fixture = await setUp();
      await spendOnTrip(fixture, '6000');
      await tripBudget(fixture, '5000');
      expect(await run(fixture)).toBe(1);

      await tripBudget(fixture, '10000');
      expect(await run(fixture)).toBe(0);

      await spendOnTrip(fixture, '4000');
      expect(await run(fixture)).toBe(1);
      expect(mailer.to(fixture.user.email)[1]?.subject).toBe(
        'Бюджет тега «Отпуск» превышен',
      );
    });

    it('says nothing within the budget, without one, or with letters off', async () => {
      const fixture = await setUp();
      await spendOnTrip(fixture, '4999.99');
      await tripBudget(fixture, '5000');
      expect(await run(fixture)).toBe(0);

      await spendOnTrip(fixture, '1');
      await tripBudget(fixture, null);
      expect(await run(fixture)).toBe(0);

      await tripBudget(fixture, '5000');
      await http()
        .put('/api/auth/notifications')
        .set(fixture.auth)
        .send({ budgetAlerts: false })
        .expect(200);
      expect(await run(fixture)).toBe(0);
      expect(mailer.to(fixture.user.email)).toHaveLength(0);
    });
  });

  it('does not count a category whose limit was taken away', async () => {
    const fixture = await setUp();
    await spend(fixture, '31000');
    await http()
      .put(`/api/budgets/${fixture.food.id}`)
      .set(fixture.auth)
      .send({ month: MONTH, amount: null })
      .expect(204);

    expect(await run(fixture)).toBe(0);
  });
});
