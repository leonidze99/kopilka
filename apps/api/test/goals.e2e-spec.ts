import type { NestExpressApplication } from '@nestjs/platform-express';
import { goalSchema } from '@kopilka/shared';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Goals (e2e)', () => {
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
    const auth = { Authorization: user.auth };
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set(auth)
      .expect(200);
    const { body: savings } = await http()
      .post('/api/accounts')
      .set(auth)
      .send({
        name: 'Накопления',
        type: 'savings',
        openingBalance: '50000',
        allowNegative: false,
      })
      .expect(201);
    return {
      user,
      auth,
      cardId: accounts.items[0].id as string,
      savingsId: savings.id as string,
    };
  }

  const create = (fixture: { auth: Record<string, string> }, body: object) =>
    http().post('/api/goals').set(fixture.auth).send(body);

  const list = async (fixture: { auth: Record<string, string> }) =>
    (await http().get('/api/goals').set(fixture.auth).expect(200)).body.map(
      (goal: unknown) => goalSchema.parse(goal),
    );

  it('counts the balance of its account as what is saved', async () => {
    const fixture = await setUp();

    const { body } = await create(fixture, {
      accountId: fixture.savingsId,
      name: 'На отпуск',
      targetAmount: '200000',
    }).expect(201);

    expect(goalSchema.parse(body)).toMatchObject({
      name: 'На отпуск',
      targetAmount: '200000.00',
      saved: '50000.00',
      remaining: '150000.00',
      percent: 25,
      // No date: nothing to say about a monthly amount.
      monthly: null,
      account: { id: fixture.savingsId },
    });
  });

  it('follows the money as it moves', async () => {
    const fixture = await setUp();
    await create(fixture, {
      accountId: fixture.savingsId,
      name: 'На отпуск',
      targetAmount: '200000',
    }).expect(201);

    // A transfer onto the account is saving towards the goal.
    await http()
      .post('/api/transactions')
      .set(fixture.auth)
      .send({
        type: 'transfer',
        accountId: fixture.cardId,
        toAccountId: fixture.savingsId,
        amount: '30000',
        occurredAt: new Date(),
      })
      .expect(201);

    const [goal] = await list(fixture);
    expect(goal).toMatchObject({ saved: '80000.00', remaining: '120000.00' });
    expect(goal.percent).toBe(40);
  });

  it('says what to put aside every month to make the date', async () => {
    const fixture = await setUp();
    const inThreeMonths = new Date();
    inThreeMonths.setUTCMonth(inThreeMonths.getUTCMonth() + 2);
    const targetDate = `${inThreeMonths.toISOString().slice(0, 8)}28`;

    const { body } = await create(fixture, {
      accountId: fixture.savingsId,
      name: 'Ноутбук',
      targetAmount: '110000',
      targetDate,
    }).expect(201);

    // 60 000 left over three months, this one counted; rounded up, or the
    // last month would fall short.
    expect(body).toMatchObject({ remaining: '60000.00', monthly: '20000.00' });
  });

  it('calls a reached goal done and asks for nothing more', async () => {
    const fixture = await setUp();

    const { body } = await create(fixture, {
      accountId: fixture.savingsId,
      name: 'Подушка',
      targetAmount: '50000',
      targetDate: '2030-01-31',
    }).expect(201);

    expect(body).toMatchObject({
      percent: 100,
      remaining: '0.00',
      monthly: null,
    });
  });

  it('keeps one goal per account', async () => {
    const fixture = await setUp();
    await create(fixture, {
      accountId: fixture.savingsId,
      name: 'Первая',
      targetAmount: '1000',
    }).expect(201);

    const res = await create(fixture, {
      accountId: fixture.savingsId,
      name: 'Вторая',
      targetAmount: '2000',
    }).expect(409);

    expect(res.body.details[0]).toMatchObject({ field: 'accountId' });
  });

  it('replaces and gives up a goal, leaving the money alone', async () => {
    const fixture = await setUp();
    const { body: goal } = await create(fixture, {
      accountId: fixture.savingsId,
      name: 'На отпуск',
      targetAmount: '200000',
    }).expect(201);

    const { body: changed } = await http()
      .put(`/api/goals/${goal.id}`)
      .set(fixture.auth)
      .send({
        accountId: fixture.savingsId,
        name: 'На машину',
        targetAmount: '500000',
      })
      .expect(200);
    expect(changed).toMatchObject({ name: 'На машину', percent: 10 });

    await http().delete(`/api/goals/${goal.id}`).set(fixture.auth).expect(204);
    expect(await list(fixture)).toHaveLength(0);

    const { body: accounts } = await http()
      .get('/api/accounts')
      .set(fixture.auth)
      .expect(200);
    const savings = accounts.items.find(
      (account: { id: string }) => account.id === fixture.savingsId,
    );
    expect(savings.balance).toBe('50000.00');
  });

  it("hides another user's goal and account behind an error", async () => {
    const fixture = await setUp();
    const stranger = await setUp();
    const { body: goal } = await create(fixture, {
      accountId: fixture.savingsId,
      name: 'Моя',
      targetAmount: '1000',
    }).expect(201);

    await http().delete(`/api/goals/${goal.id}`).set(stranger.auth).expect(404);
    const res = await create(stranger, {
      accountId: fixture.savingsId,
      name: 'Чужая',
      targetAmount: '1000',
    }).expect(400);
    expect(res.body.details[0]).toMatchObject({ field: 'accountId' });
  });

  it('goes away with its account', async () => {
    const fixture = await setUp();
    await create(fixture, {
      accountId: fixture.savingsId,
      name: 'На отпуск',
      targetAmount: '200000',
    }).expect(201);

    await http()
      .delete(`/api/accounts/${fixture.savingsId}`)
      .set(fixture.auth)
      .expect(204);

    expect(await list(fixture)).toHaveLength(0);
  });
});
