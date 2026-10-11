import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpStatus,
  INestApplication,
  InternalServerErrorException,
  Post,
} from '@nestjs/common';
import {
  apiErrorSchema,
  transactionInputSchema,
  type TransactionInputDto,
} from '@kopilka/shared';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { Public } from './../src/auth/public.decorator.js';
import { AppException } from './../src/common/errors/app.exception.js';
import { Prisma } from './../src/generated/prisma/client.js';
import { createTestApp } from './utils/create-test-app.js';

@Public()
@Controller('__test')
class ErrorsTestController {
  @Post('transactions')
  create(@Body({ schema: transactionInputSchema }) dto: TransactionInputDto) {
    return { occurredAtIsDate: dto.occurredAt instanceof Date };
  }

  @Get('app-exception')
  appException() {
    throw new AppException(
      'CONFLICT',
      'Email is already taken',
      HttpStatus.CONFLICT,
      [{ field: 'email', message: 'Email is already taken' }],
    );
  }

  @Get('forbidden')
  forbidden() {
    throw new ForbiddenException();
  }

  @Get('crash')
  crash() {
    throw new Error('connection to db://admin:secret failed');
  }

  @Get('internal')
  internal() {
    throw new InternalServerErrorException('secret internals');
  }

  @Get('unique')
  unique() {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: Prisma.prismaVersion.client,
    });
  }

  @Get('not-found')
  notFound() {
    throw new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: Prisma.prismaVersion.client,
    });
  }
}

const validTransaction = {
  type: 'expense',
  accountId: '0199d0a4-5b6e-7c3d-8e9f-0a1b2c3d4e60',
  amount: '100',
  categoryId: '0199d0a4-5b6e-7c3d-8e9f-0a1b2c3d4e5f',
  occurredAt: '2026-10-11T10:00:00.000Z',
};

describe('Error format (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ErrorsTestController] });
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('returns the shared error shape with the same requestId as the header', async () => {
    const res = await http().get('/api/no-such-route').expect(404);

    expect(apiErrorSchema.parse(res.body)).toEqual({
      code: 'NOT_FOUND',
      message: 'Cannot GET /api/no-such-route',
      requestId: res.headers['x-request-id'],
    });
  });

  it('reuses a valid incoming X-Request-ID', async () => {
    const res = await http()
      .get('/api/no-such-route')
      .set('X-Request-ID', 'front-abc_123')
      .expect(404);

    expect(res.headers['x-request-id']).toBe('front-abc_123');
    expect(res.body.requestId).toBe('front-abc_123');
  });

  it.each(['has spaces', 'x'.repeat(129), 'inject\\nnewline'])(
    'replaces an unsafe incoming X-Request-ID %#',
    async (unsafe) => {
      const res = await http()
        .get('/api/no-such-route')
        .set('X-Request-ID', unsafe)
        .expect(404);

      expect(res.body.requestId).not.toBe(unsafe);
      expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it('reports every validation issue with its field', async () => {
    const res = await http()
      .post('/api/__test/transactions')
      .send({ type: 'expense', amount: '-1' })
      .expect(400);

    const body = apiErrorSchema.parse(res.body);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details?.map((d) => d.field)).toEqual([
      'categoryId',
      'accountId',
      'amount',
      'occurredAt',
    ]);
  });

  it('passes the parsed value to the handler', async () => {
    const res = await http()
      .post('/api/__test/transactions')
      .send(validTransaction)
      .expect(201);

    expect(res.body).toEqual({ occurredAtIsDate: true });
  });

  it('answers malformed JSON with BAD_REQUEST', async () => {
    const res = await http()
      .post('/api/__test/transactions')
      .set('Content-Type', 'application/json')
      .send('{"amount": ')
      .expect(400);

    expect(apiErrorSchema.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('passes through body-parser errors such as an oversized body', async () => {
    const res = await http()
      .post('/api/__test/transactions')
      .send({ comment: 'x'.repeat(200 * 1024) })
      .expect(413);

    expect(res.body).toMatchObject({
      code: 'BAD_REQUEST',
      message: 'request entity too large',
    });
  });

  it('keeps code and details of an AppException', async () => {
    const res = await http().get('/api/__test/app-exception').expect(409);

    expect(res.body).toMatchObject({
      code: 'CONFLICT',
      message: 'Email is already taken',
      details: [{ field: 'email', message: 'Email is already taken' }],
    });
  });

  it('maps built-in HttpExceptions by status', async () => {
    const res = await http().get('/api/__test/forbidden').expect(403);

    expect(res.body).toMatchObject({ code: 'FORBIDDEN', message: 'Forbidden' });
  });

  it.each([
    ['/api/__test/crash', 'db://admin:secret'],
    ['/api/__test/internal', 'secret internals'],
  ])('hides internals of 5xx errors (%s)', async (path, secret) => {
    const res = await http().get(path).expect(500);

    expect(res.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it.each([
    ['/api/__test/unique', 409, 'CONFLICT'],
    ['/api/__test/not-found', 404, 'NOT_FOUND'],
  ])('falls back on Prisma error codes (%s)', async (path, status, code) => {
    const res = await http().get(path).expect(status);

    expect(res.body.code).toBe(code);
  });
});
