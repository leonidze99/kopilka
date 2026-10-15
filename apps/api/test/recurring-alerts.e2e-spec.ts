import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { MailerService } from '../src/mail/mailer.service.js';
import { RecurringAlertsService } from '../src/recurring/recurring-alerts.service.js';
import { RecurringRunner } from '../src/recurring/recurring.runner.js';
import { todayIn } from '../src/recurring/schedule.js';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';
import { FakeMailer } from './utils/fake-mailer.js';

describe('Recurring alerts (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let runner: RecurringRunner;
  let alerts: RecurringAlertsService;
  let mailer: FakeMailer;

  beforeAll(async () => {
    mailer = new FakeMailer();
    app = await createTestApp({
      overrides: [{ provide: MailerService, useValue: mailer }],
    });
    users = testUsers(app);
    runner = app.get(RecurringRunner);
    alerts = app.get(RecurringAlertsService);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Intl groups thousands with a no-break space; read them as plain ones. */
  const plain = (text = '') => text.split(String.fromCharCode(160)).join(' ');

  const DAY = 24 * 60 * 60 * 1000;
  const now = new Date();

  /** Cash that must not go negative, with 1000 on it, and a rent category. */
  async function setUp() {
    const user = await users.signUp();
    const auth = { Authorization: user.auth };
    const { body: cash } = await http()
      .post('/api/accounts')
      .set(auth)
      .send({
        name: 'Наличные',
        type: 'cash',
        openingBalance: '1000',
        allowNegative: false,
      })
      .expect(201);
    const { body: rent } = await http()
      .post('/api/categories')
      .set(auth)
      .send({ kind: 'expense', name: 'Жильё' })
      .expect(201);
    return {
      user,
      auth,
      cash: cash as { id: string },
      rent: rent as { id: string },
    };
  }
  type Fixture = Awaited<ReturnType<typeof setUp>>;

  const rule = (fixture: Fixture, extra: object = {}) =>
    http()
      .post('/api/recurring')
      .set(fixture.auth)
      .send({
        type: 'expense',
        categoryId: fixture.rent.id,
        accountId: fixture.cash.id,
        amount: '5000',
        comment: 'Аренда',
        startOn: todayIn('UTC', now),
        timeZone: 'UTC',
        ...extra,
      })
      .expect(201);

  /** Only this user's rules and skips: the suites share one database. */
  const runDue = (fixture: { user: TestUser }, at = now) =>
    runner.runDue(at, { userId: fixture.user.id });
  const runAlerts = (fixture: { user: TestUser }) =>
    alerts.run({ userId: fixture.user.id });

  it('mails once about a payment skipped for lack of money', async () => {
    const fixture = await setUp();
    await rule(fixture);
    await runDue(fixture);

    expect(await runAlerts(fixture)).toBe(1);

    const [mail] = mailer.to(fixture.user.email);
    expect(mail?.subject).toBe('Не прошёл платёж «Аренда»');
    expect(plain(mail?.text)).toContain(
      '«Аренда»: на счёте «Наличные» не хватило 4 000,00 ₽.',
    );
    expect(mail?.text).toContain('/recurring');
    // The same skip is not news an hour later.
    expect(await runAlerts(fixture)).toBe(0);
    expect(mailer.to(fixture.user.email)).toHaveLength(1);
  });

  it('puts several skips into one letter', async () => {
    const fixture = await setUp();
    await rule(fixture, { every: 1, unit: 'day' });
    // Three days on: today and the two after are due, none can be paid.
    await runDue(fixture, new Date(now.getTime() + 2 * DAY));

    expect(await runAlerts(fixture)).toBe(1);

    const [mail] = mailer.to(fixture.user.email);
    expect(mail?.subject).toBe('Не прошли 3 регулярных платежа');
    expect(mail?.text.match(/«Аренда»: на счёте/g)).toHaveLength(3);
  });

  it('says nothing about a payment that went through', async () => {
    const fixture = await setUp();
    await rule(fixture, { amount: '500' });
    await runDue(fixture);

    expect(await runAlerts(fixture)).toBe(0);
  });

  it('lets skips go while the letters are off, and does not mail them later', async () => {
    const fixture = await setUp();
    const toggle = (recurringAlerts: boolean) =>
      http()
        .put('/api/auth/notifications')
        .set(fixture.auth)
        .send({ recurringAlerts })
        .expect(200);
    const { body: user } = await toggle(false);
    expect(user).toMatchObject({ recurringAlerts: false, budgetAlerts: true });
    await rule(fixture);
    await runDue(fixture);

    expect(await runAlerts(fixture)).toBe(0);
    await toggle(true);
    expect(await runAlerts(fixture)).toBe(0);
    expect(mailer.to(fixture.user.email)).toHaveLength(0);
  });
});
