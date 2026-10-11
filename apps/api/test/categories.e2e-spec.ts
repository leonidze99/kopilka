import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, categorySchema } from '@kopilka/shared';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Categories (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app);
    [alice, bob] = await Promise.all([users.signUp(), users.signUp()]);
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const create = (user: TestUser, body: object) =>
    http().post('/api/categories').set('Authorization', user.auth).send(body);

  it('requires an access token', async () => {
    await http().get('/api/categories').expect(401);
  });

  it('creates a category with a trimmed name', async () => {
    const res = await create(alice, {
      kind: 'expense',
      name: '  Кафе ',
    }).expect(201);

    expect(categorySchema.parse(res.body)).toMatchObject({
      kind: 'expense',
      name: 'Кафе',
    });
  });

  it('allows the same name once per kind', async () => {
    await create(alice, { kind: 'expense', name: 'Подарки' }).expect(201);
    await create(alice, { kind: 'income', name: 'Подарки' }).expect(201);

    const res = await create(alice, {
      kind: 'expense',
      name: 'Подарки',
    }).expect(409);
    expect(apiErrorSchema.parse(res.body)).toMatchObject({
      code: 'CONFLICT',
      details: [{ field: 'name' }],
    });
  });

  it('lists only own categories, by kind and name', async () => {
    const user = await users.signUp();
    await create(user, { kind: 'income', name: 'Зарплата' }).expect(201);
    await create(user, { kind: 'expense', name: 'Транспорт' }).expect(201);
    await create(user, { kind: 'expense', name: 'Аптека' }).expect(201);

    const res = await http()
      .get('/api/categories')
      .set('Authorization', user.auth)
      .expect(200);

    expect(
      res.body.map(
        (c: { kind: string; name: string }) => `${c.kind}:${c.name}`,
      ),
    ).toEqual(['income:Зарплата', 'expense:Аптека', 'expense:Транспорт']);
  });

  it('renames a category but never changes its kind', async () => {
    const { body: category } = await create(alice, {
      kind: 'expense',
      name: 'Такси',
    }).expect(201);

    const res = await http()
      .patch(`/api/categories/${category.id}`)
      .set('Authorization', alice.auth)
      .send({ name: 'Транспорт', kind: 'income' })
      .expect(200);

    expect(res.body).toEqual({ ...category, name: 'Транспорт' });
  });

  it("hides another user's category behind 404", async () => {
    const { body: category } = await create(alice, {
      kind: 'expense',
      name: 'Личное',
    }).expect(201);

    const res = await http()
      .patch(`/api/categories/${category.id}`)
      .set('Authorization', bob.auth)
      .send({ name: 'Взлом' })
      .expect(404);
    await http()
      .delete(`/api/categories/${category.id}`)
      .set('Authorization', bob.auth)
      .expect(404);

    expect(res.body.code).toBe('NOT_FOUND');
    const own = await http()
      .get('/api/categories')
      .set('Authorization', bob.auth);
    expect(own.body).toEqual([]);
  });

  it('deletes an unused category', async () => {
    const { body: category } = await create(alice, {
      kind: 'income',
      name: 'Кэшбэк',
    }).expect(201);

    await http()
      .delete(`/api/categories/${category.id}`)
      .set('Authorization', alice.auth)
      .expect(204);
    await http()
      .delete(`/api/categories/${category.id}`)
      .set('Authorization', alice.auth)
      .expect(404);
  });

  it('refuses to delete a category that transactions use', async () => {
    const { body: category } = await create(alice, {
      kind: 'expense',
      name: 'Продукты',
    }).expect(201);
    const {
      body: {
        items: [account],
      },
    } = await http()
      .get('/api/accounts')
      .set('Authorization', alice.auth)
      .expect(200);
    await http()
      .post('/api/transactions')
      .set('Authorization', alice.auth)
      .send({
        type: 'expense',
        categoryId: category.id,
        accountId: account.id,
        amount: '100',
        occurredAt: '2026-10-01T10:00:00Z',
      })
      .expect(201);

    const res = await http()
      .delete(`/api/categories/${category.id}`)
      .set('Authorization', alice.auth)
      .expect(409);

    expect(res.body.code).toBe('CATEGORY_IN_USE');
  });

  it('rejects a malformed id with 400 instead of a database error', async () => {
    const res = await http()
      .delete('/api/categories/not-a-uuid')
      .set('Authorization', alice.auth)
      .expect(400);

    expect(res.body.code).toBe('BAD_REQUEST');
  });
});
