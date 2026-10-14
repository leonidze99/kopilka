import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS,
  receiptSchema,
  transactionPageSchema,
} from '@kopilka/shared';
import sharp from 'sharp';
import request from 'supertest';
import { type TestUser, testUsers } from './utils/auth.js';
import { createTestApp } from './utils/create-test-app.js';

describe('Receipts (e2e)', () => {
  let app: NestExpressApplication;
  let users: ReturnType<typeof testUsers>;
  let photo: Buffer;

  beforeAll(async () => {
    app = await createTestApp();
    users = testUsers(app);
    // A phone photo, more or less: large, sideways by EXIF, with an author.
    photo = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#ddd' },
    })
      .withMetadata({ orientation: 6 })
      .withExif({ IFD0: { Artist: 'Phone owner' } })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    await users.cleanup();
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** A user and one expense of theirs. */
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
    const { body: transaction } = await http()
      .post('/api/transactions')
      .set('Authorization', user.auth)
      .send({
        type: 'expense',
        accountId: accounts.items[0].id,
        categoryId: food.id,
        amount: '100',
        occurredAt: '2026-10-05T12:00:00Z',
      })
      .expect(201);
    return { user, transactionId: transaction.id as string };
  }

  const upload = (
    user: TestUser,
    transactionId: string,
    file: Buffer = photo,
    filename = 'receipt.jpg',
  ) =>
    http()
      .post(`/api/transactions/${transactionId}/receipts`)
      .set('Authorization', user.auth)
      .attach('file', file, { filename, contentType: 'image/jpeg' });

  const fetchImage = (user: TestUser, id: string, variant: string) =>
    http()
      .get(`/api/receipts/${id}/${variant}`)
      .set('Authorization', user.auth)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  it('stores a photo upright, resized, as WebP and without its EXIF', async () => {
    const { user, transactionId } = await setUp();

    const res = await upload(user, transactionId).expect(201);

    const receipt = receiptSchema.parse(res.body);
    // 3000×2000 turned by 90° and fitted into 2000.
    expect(receipt).toMatchObject({ width: 1333, height: 2000 });
    const image = await fetchImage(user, receipt.id, 'image').expect(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cache-control']).toBe(
      'private, max-age=31536000, immutable',
    );
    const stored = await sharp(image.body as Buffer).metadata();
    expect(stored).toMatchObject({ format: 'webp', width: 1333, height: 2000 });
    expect(stored.exif).toBeUndefined();
    expect((image.body as Buffer).length).toBe(receipt.size);

    const thumbnail = await fetchImage(user, receipt.id, 'thumbnail').expect(
      200,
    );
    expect((thumbnail.body as Buffer).length).toBeLessThan(receipt.size);
  });

  it('lists the receipts with the transaction, oldest first', async () => {
    const { user, transactionId } = await setUp();
    const { body: first } = await upload(user, transactionId).expect(201);
    const { body: second } = await upload(user, transactionId).expect(201);

    const res = await http()
      .get('/api/transactions')
      .set('Authorization', user.auth)
      .expect(200);

    const [transaction] = transactionPageSchema.parse(res.body).items;
    expect(transaction?.receipts.map((receipt) => receipt.id)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it(`takes at most ${MAX_RECEIPTS} photos, even sent at once`, async () => {
    const { user, transactionId } = await setUp();
    const small = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();

    const results = await Promise.all(
      Array.from({ length: MAX_RECEIPTS + 2 }, () =>
        upload(user, transactionId, small, 'r.png'),
      ),
    );

    const statuses = results.map((res) => res.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(
      MAX_RECEIPTS,
    );
    const refused = results.find((res) => res.status === 409);
    expect(refused?.body.details).toEqual([
      { field: 'file', message: `Не больше ${MAX_RECEIPTS} фото на операцию` },
    ]);
  });

  it('refuses a file that is not a photo, whatever it is called', async () => {
    const { user, transactionId } = await setUp();

    const res = await upload(
      user,
      transactionId,
      Buffer.from('%PDF-1.4 not an image'),
      'receipt.jpg',
    ).expect(400);

    expect(res.body.details).toEqual([
      {
        field: 'file',
        message: 'Не удалось прочитать фото: подходят JPEG, PNG, WebP и AVIF',
      },
    ]);
  });

  it('refuses a file over the limit as it arrives', async () => {
    const { user, transactionId } = await setUp();

    const res = await upload(
      user,
      transactionId,
      Buffer.alloc(MAX_RECEIPT_BYTES + 1024),
    ).expect(413);

    expect(res.body.details).toEqual([
      { field: 'file', message: 'Файл больше 15 МБ' },
    ]);
  });

  it("treats another user's transaction and receipt as missing", async () => {
    const alice = await setUp();
    const bob = await setUp();
    const { body: receipt } = await upload(
      alice.user,
      alice.transactionId,
    ).expect(201);

    await upload(bob.user, alice.transactionId).expect(404);
    await fetchImage(bob.user, receipt.id, 'image').expect(404);
    await http()
      .delete(`/api/receipts/${receipt.id}`)
      .set('Authorization', bob.user.auth)
      .expect(404);
  });

  it('deletes a receipt, and all of them with their transaction', async () => {
    const { user, transactionId } = await setUp();
    const { body: kept } = await upload(user, transactionId).expect(201);
    const { body: removed } = await upload(user, transactionId).expect(201);

    await http()
      .delete(`/api/receipts/${removed.id}`)
      .set('Authorization', user.auth)
      .expect(204);
    await fetchImage(user, removed.id, 'thumbnail').expect(404);
    await fetchImage(user, kept.id, 'thumbnail').expect(200);

    await http()
      .delete(`/api/transactions/${transactionId}`)
      .set('Authorization', user.auth)
      .expect(204);
    await fetchImage(user, kept.id, 'thumbnail').expect(404);
  });
});
