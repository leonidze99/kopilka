import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  accountListSchema,
  budgetListSchema,
  recurringRuleListSchema,
  transactionPageSchema,
} from '@kopilka/shared';
import request from 'supertest';
import {
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_TIME_ZONE,
} from '../src/demo/demo-data.js';
import { seedDemo } from '../src/demo/seed-demo.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { todayIn } from '../src/recurring/schedule.js';
import { createTestApp } from './utils/create-test-app.js';

/**
 * The seed writes past the services; here the API reads the result back
 * and its own rules judge it.
 */
describe('Demo seed (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  async function signIn() {
    const { body } = await http()
      .post('/api/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    return `Bearer ${body.accessToken as string}`;
  }

  it('creates an account the API is happy with', async () => {
    const { transactions } = await seedDemo(prisma);
    const auth = await signIn();

    const accounts = accountListSchema.parse(
      (await http().get('/api/accounts').set('Authorization', auth).expect(200))
        .body,
    );
    expect(accounts.items.map((a) => a.name)).toEqual([
      'Основной счёт',
      'Наличные',
      'Накопления',
    ]);
    for (const account of accounts.items.filter((a) => !a.allowNegative)) {
      expect(Number(account.balance), account.name).toBeGreaterThanOrEqual(0);
    }

    // Every row reads back as a valid income, expense or transfer.
    let read = 0;
    let fromRules = 0;
    let cursor: string | null = null;
    do {
      const page = transactionPageSchema.parse(
        (
          await http()
            .get('/api/transactions')
            .query({ limit: 100, ...(cursor ? { cursor } : {}) })
            .set('Authorization', auth)
            .expect(200)
        ).body,
      );
      read += page.items.length;
      fromRules += page.items.filter((t) => t.recurringRuleId).length;
      cursor = page.nextCursor;
    } while (cursor);
    expect(read).toBe(transactions);
    expect(fromRules).toBeGreaterThan(0);

    const today = todayIn(DEMO_TIME_ZONE, new Date());
    const rules = recurringRuleListSchema.parse(
      (
        await http()
          .get('/api/recurring')
          .set('Authorization', auth)
          .expect(200)
      ).body,
    );
    expect(rules).toHaveLength(3);
    for (const rule of rules) expect(rule.nextOn > today).toBe(true);

    const month = today.slice(0, 7);
    const budgets = budgetListSchema.parse(
      (
        await http()
          .get('/api/budgets')
          .query({
            month,
            from: new Date(`${month}-01T00:00:00+03:00`).toISOString(),
            to: new Date().toISOString(),
          })
          .set('Authorization', auth)
          .expect(200)
      ).body,
    );
    expect(
      budgets.items.map((b) => [b.category.name, b.limit, b.since]),
    ).toEqual(expect.arrayContaining([['Продукты', '35000.00', month]]));
  });

  it('replaces the demo account on every run, signing old sessions out', async () => {
    await seedDemo(prisma);
    const login = await http()
      .post('/api/auth/login')
      .send({ email: DEMO_EMAIL, password: DEMO_PASSWORD })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('refresh_token='))
      ?.split(';')[0];

    await seedDemo(prisma);

    expect(await prisma.user.count({ where: { email: DEMO_EMAIL } })).toBe(1);
    // The old user is gone, its refresh tokens with it.
    await http()
      .post('/api/auth/refresh')
      .set('Cookie', cookie ?? '')
      .expect(401);
  });
});
