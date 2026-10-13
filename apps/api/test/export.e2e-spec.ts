import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('CSV export (e2e)', () => {
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

  /** A user with two accounts, one category and three transactions. */
  async function setUp() {
    const user = await users.signUp();
    const auth = { Authorization: user.auth };

    const { body: accounts } = await http()
      .get('/api/accounts')
      .set(auth)
      .expect(200);
    const card = accounts.items[0] as { id: string };
    const { body: savings } = await http()
      .post('/api/accounts')
      .set(auth)
      .send({ name: 'Накопления', type: 'savings' })
      .expect(201);
    const { body: food } = await http()
      .post('/api/categories')
      .set(auth)
      .send({ kind: 'expense', name: 'Кафе; бар' })
      .expect(201);

    const add = (body: object) =>
      http().post('/api/transactions').set(auth).send(body).expect(201);

    await add({
      type: 'expense',
      categoryId: food.id,
      accountId: card.id,
      amount: '1234.50',
      // Both characters CSV has to escape.
      comment: 'Скидка "весна"; десерт',
      occurredAt: '2026-10-12T22:30:00.000Z',
    });
    await add({
      type: 'transfer',
      accountId: card.id,
      toAccountId: savings.id,
      amount: '500',
      occurredAt: '2026-10-11T09:00:00.000Z',
    });
    return { user, auth };
  }

  const exportCsv = (user: TestUser, query = 'timeZone=Europe/Moscow') =>
    http()
      .get(`/api/transactions/export?${query}`)
      .set('Authorization', user.auth);

  it('streams a file Excel opens, oldest row first', async () => {
    const { user } = await setUp();

    const res = await exportCsv(user).expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="kopilka-transactions-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    // The byte order mark, or Excel reads UTF-8 as the system codepage.
    expect(res.text.startsWith('﻿')).toBe(true);

    const lines = res.text.replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe(
      'Дата;Тип;Категория;Счёт;Счёт назначения;Сумма;Комментарий',
    );
    // Chronological, and the dates are in the zone that was asked for.
    expect(lines[1]).toBe(
      '11.10.2026 12:00;Перевод;;Основной счёт;Накопления;500,00;',
    );
    // A field with a semicolon or a quote is quoted, its quotes doubled.
    expect(lines[2]).toBe(
      '13.10.2026 01:30;Расход;"Кафе; бар";Основной счёт;;1234,50;"Скидка ""весна""; десерт"',
    );
  });

  it('takes the filters of the feed', async () => {
    const { user } = await setUp();

    const res = await exportCsv(user, 'timeZone=UTC&type=transfer').expect(200);

    const lines = res.text.replace('﻿', '').trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Перевод');
  });

  it('exports nobody else of the user list', async () => {
    const { user } = await setUp();
    const stranger = await users.signUp();

    const res = await exportCsv(stranger).expect(200);

    expect(res.text.replace('﻿', '').trim().split('\r\n')).toHaveLength(1);
    expect(res.text).not.toContain('Накопления');
    expect(user.id).toBeTruthy();
  });

  it('insists on a time zone, which decides the dates', async () => {
    const { user } = await setUp();

    const res = await exportCsv(user, '').expect(400);

    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details?.[0]?.field).toBe('timeZone');
  });
});
