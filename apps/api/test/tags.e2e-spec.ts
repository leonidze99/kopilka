import type { NestExpressApplication } from '@nestjs/platform-express';
import { type Category, type Tag, transactionSchema } from '@kopilka/shared';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Tags (e2e)', () => {
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

  /** A user with an expense category and their account. */
  async function setUp() {
    const user = await users.signUp();
    const { body: accounts } = await http()
      .get('/api/accounts')
      .set('Authorization', user.auth)
      .expect(200);
    const { body: food } = await http()
      .post('/api/categories')
      .set('Authorization', user.auth)
      .send({ kind: 'expense', name: 'Продукты' })
      .expect(201);
    return {
      user,
      accountId: (accounts.items[0] as { id: string }).id,
      food: food as Category,
    };
  }
  type Fixture = Awaited<ReturnType<typeof setUp>>;

  const expense = (
    { accountId, food }: Fixture,
    tags?: string[],
    amount = '100',
  ) => ({
    type: 'expense',
    accountId,
    categoryId: food.id,
    amount,
    occurredAt: '2026-10-05T12:00:00Z',
    ...(tags && { tags }),
  });

  const add = (user: TestUser, body: object) =>
    http().post('/api/transactions').set('Authorization', user.auth).send(body);

  const get = (user: TestUser, path: string, query: object = {}) =>
    http()
      .get(`/api/${path}`)
      .query(query)
      .set('Authorization', user.auth)
      .expect(200);

  const tagsOf = async (user: TestUser) =>
    (await get(user, 'tags')).body as Tag[];

  describe('on a transaction', () => {
    it('makes new tags by name, one per name whatever its case or ё', async () => {
      const fixture = await setUp();

      const res = await add(
        fixture.user,
        expense(fixture, ['Отпуск', ' отпуск ', 'Ёлка', 'елка']),
      ).expect(201);

      const tags = await tagsOf(fixture.user);
      expect(tags.map((tag) => tag.name)).toEqual(['Ёлка', 'Отпуск']);
      expect(transactionSchema.parse(res.body).tags).toEqual(tags);
    });

    it('finds an existing tag by name and keeps its spelling', async () => {
      const fixture = await setUp();
      await add(fixture.user, expense(fixture, ['Отпуск'])).expect(201);

      const res = await add(fixture.user, expense(fixture, ['ОТПУСК'])).expect(
        201,
      );

      const tags = await tagsOf(fixture.user);
      expect(tags).toHaveLength(1);
      expect(res.body.tags).toEqual([{ id: tags[0]!.id, name: 'Отпуск' }]);
    });

    it('makes one tag of a new name sent twice at once', async () => {
      const fixture = await setUp();

      await Promise.all(
        Array.from({ length: 5 }, () =>
          add(fixture.user, expense(fixture, ['Сочи'])).expect(201),
        ),
      );

      expect(await tagsOf(fixture.user)).toHaveLength(1);
      const tagged = await get(fixture.user, 'transactions', {
        tagId: (await tagsOf(fixture.user))[0]!.id,
      });
      expect(tagged.body.items).toHaveLength(5);
    });

    it('tags a transfer too', async () => {
      const fixture = await setUp();
      const { body: savings } = await http()
        .post('/api/accounts')
        .set('Authorization', fixture.user.auth)
        .send({ name: 'Вклад', type: 'savings' })
        .expect(201);

      const res = await add(fixture.user, {
        type: 'transfer',
        accountId: fixture.accountId,
        toAccountId: savings.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
        tags: ['Отпуск'],
      }).expect(201);

      expect(res.body.tags).toEqual([
        expect.objectContaining({ name: 'Отпуск' }),
      ]);
    });

    it('replaces the tags with the transaction, none if left out', async () => {
      const fixture = await setUp();
      const { body: created } = await add(
        fixture.user,
        expense(fixture, ['Отпуск', 'Сочи']),
      );

      const replace = (body: object) =>
        http()
          .put(`/api/transactions/${created.id}`)
          .set('Authorization', fixture.user.auth)
          .send(body)
          .expect(200);

      const retagged = await replace(expense(fixture, ['Сочи', 'Море']));
      expect(retagged.body.tags.map((tag: Tag) => tag.name)).toEqual([
        'Море',
        'Сочи',
      ]);
      const untagged = await replace(expense(fixture));
      expect(untagged.body.tags).toEqual([]);
    });

    it('refuses more than 10 tags and a name longer than 32', async () => {
      const fixture = await setUp();

      const many = await add(
        fixture.user,
        expense(
          fixture,
          Array.from({ length: 11 }, (_, i) => `Тег ${i}`),
        ),
      ).expect(400);
      const long = await add(
        fixture.user,
        expense(fixture, ['а'.repeat(33)]),
      ).expect(400);

      expect(many.body.details).toEqual([
        { field: 'tags', message: 'Не больше 10 тегов' },
      ]);
      expect(long.body.details).toEqual([
        { field: 'tags.0', message: 'Тег не длиннее 32 символов' },
      ]);
    });
  });

  describe('totals of a tag', () => {
    it('narrows the feed, the summary and the breakdown to the tag', async () => {
      const fixture = await setUp();
      const { body: cafe } = await http()
        .post('/api/categories')
        .set('Authorization', fixture.user.auth)
        .send({ kind: 'expense', name: 'Кафе' })
        .expect(201);
      const { body: trip } = await add(
        fixture.user,
        expense(fixture, ['Отпуск'], '1000'),
      );
      await add(fixture.user, {
        ...expense(fixture, ['Отпуск'], '500'),
        categoryId: cafe.id,
      }).expect(201);
      await add(fixture.user, expense(fixture, [], '300')).expect(201);
      const tagId = (await tagsOf(fixture.user))[0]!.id;

      const feed = await get(fixture.user, 'transactions', { tagId });
      const summary = await get(fixture.user, 'transactions/summary', {
        tagId,
      });
      const byCategory = await get(fixture.user, 'transactions/by-category', {
        tagId,
      });

      expect(feed.body.items).toHaveLength(2);
      expect(feed.body.items.map((item: { id: string }) => item.id)).toContain(
        trip.id,
      );
      expect(summary.body).toEqual({
        income: '0.00',
        expense: '1500.00',
        balance: '-1500.00',
      });
      expect(byCategory.body).toEqual([
        { category: fixture.food, total: '1000.00' },
        { category: cafe, total: '500.00' },
      ]);
    });

    it("finds nothing by another user's tag", async () => {
      const alice = await setUp();
      const bob = await setUp();
      await add(alice.user, expense(alice, ['Отпуск'])).expect(201);
      const aliceTag = (await tagsOf(alice.user))[0]!.id;

      const res = await get(bob.user, 'transactions', { tagId: aliceTag });

      expect(res.body.items).toEqual([]);
      expect(await tagsOf(bob.user)).toEqual([]);
    });
  });

  describe('rename and delete', () => {
    it('renames a tag on its transactions', async () => {
      const fixture = await setUp();
      const { body: created } = await add(
        fixture.user,
        expense(fixture, ['Отпуск']),
      );
      const [tag] = await tagsOf(fixture.user);

      await http()
        .patch(`/api/tags/${tag!.id}`)
        .set('Authorization', fixture.user.auth)
        .send({ name: 'Сочи-2026' })
        .expect(200);

      const feed = await get(fixture.user, 'transactions');
      expect(feed.body.items[0]).toMatchObject({
        id: created.id,
        tags: [{ id: tag!.id, name: 'Сочи-2026' }],
      });
    });

    it('refuses the name of another tag', async () => {
      const fixture = await setUp();
      await add(fixture.user, expense(fixture, ['Отпуск', 'Сочи']));
      const sochi = (await tagsOf(fixture.user)).find((t) => t.name === 'Сочи');

      const res = await http()
        .patch(`/api/tags/${sochi!.id}`)
        .set('Authorization', fixture.user.auth)
        .send({ name: 'отпуск' })
        .expect(409);

      expect(res.body.details).toEqual([
        { field: 'name', message: 'Тег с таким названием уже есть' },
      ]);
    });

    it('takes a deleted tag off its transactions, which stay', async () => {
      const fixture = await setUp();
      await add(fixture.user, expense(fixture, ['Отпуск'])).expect(201);
      const [tag] = await tagsOf(fixture.user);

      await http()
        .delete(`/api/tags/${tag!.id}`)
        .set('Authorization', fixture.user.auth)
        .expect(204);

      const feed = await get(fixture.user, 'transactions');
      expect(feed.body.items).toEqual([expect.objectContaining({ tags: [] })]);
    });

    it("treats another user's tag as missing", async () => {
      const alice = await setUp();
      const bob = await setUp();
      await add(alice.user, expense(alice, ['Отпуск'])).expect(201);
      const [tag] = await tagsOf(alice.user);

      await http()
        .patch(`/api/tags/${tag!.id}`)
        .set('Authorization', bob.user.auth)
        .send({ name: 'Моё' })
        .expect(404);
      await http()
        .delete(`/api/tags/${tag!.id}`)
        .set('Authorization', bob.user.auth)
        .expect(404);
    });
  });

  it('exports the tags as the last column', async () => {
    const fixture = await setUp();
    await add(fixture.user, expense(fixture, ['Сочи', 'Отпуск'])).expect(201);

    const res = await http()
      .get('/api/transactions/export?timeZone=UTC')
      .set('Authorization', fixture.user.auth)
      .expect(200);

    const [header, line] = res.text.replace('﻿', '').trim().split('\r\n');
    expect(header).toMatch(/;Комментарий;Теги$/);
    expect(line).toMatch(/;Отпуск, Сочи$/);
  });
});
