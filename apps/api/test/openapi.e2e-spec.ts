import { Body, Controller, Post } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  createTransactionSchema,
  type CreateTransactionDto,
} from '@kopilka/shared';
import { readFileSync } from 'node:fs';
import request from 'supertest';
import { Public } from './../src/auth/public.decorator.js';
import { createOpenApiDocument } from './../src/openapi.js';
import { createTestApp } from './utils/create-test-app.js';

const COMMITTED = new URL('../openapi.json', import.meta.url);

describe('OpenAPI (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('matches the committed openapi.json (run `pnpm api:generate` if not)', () => {
    // The frontend builds its types from the committed file: if it drifts
    // from the code, the frontend silently talks to an API that no longer
    // exists.
    const committed: unknown = JSON.parse(readFileSync(COMMITTED, 'utf8'));
    expect(JSON.parse(JSON.stringify(createOpenApiDocument(app)))).toEqual(
      committed,
    );
  });

  it('describes request and response bodies with the shared Zod schemas', async () => {
    const { body: doc } = await http().get('/docs/openapi.json').expect(200);

    const login = doc.paths['/auth/login'].post;
    expect(login.requestBody.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/LoginRequest',
    });
    expect(login.responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/AuthResponse',
    });
    expect(login.responses['401'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiError',
    });
    expect(doc.components.schemas.RegisterRequest.properties.email).toEqual({
      type: 'string',
      format: 'email',
      maxLength: 254,
    });
  });

  it('requires a bearer token unless the route is @Public()', async () => {
    const { body: doc } = await http().get('/docs/openapi.json').expect(200);

    expect(doc.security).toEqual([{ bearer: [] }]);
    expect(doc.paths['/auth/me'].get.security).toBeUndefined();
    expect(doc.paths['/auth/login'].post.security).toEqual([{}]);
    expect(doc.paths['/health/ready'].get.security).toEqual([{}]);
  });

  it('serves Swagger UI with scripts allowed by the CSP', async () => {
    const page = await http().get('/docs').expect(200);

    // Only same-origin scripts: allowed by helmet's script-src 'self'.
    expect(page.text).not.toMatch(/<script>(?!<\/script>)/);
    expect(page.headers['content-security-policy']).toMatch(
      /script-src 'self'/,
    );
    // Would rewrite the scripts to https:// on a plain HTTP dev server.
    expect(page.headers['content-security-policy']).not.toMatch(
      /upgrade-insecure-requests/,
    );
    await http().get('/docs/swagger-ui-init.js').expect(200);
  });
});

describe('OpenAPI for date fields (e2e)', () => {
  @Public()
  @Controller('__dates')
  class DatesTestController {
    @Post()
    create(
      @Body({ schema: createTransactionSchema }) dto: CreateTransactionDto,
    ) {
      return dto;
    }
  }

  let app: NestExpressApplication;

  beforeAll(async () => {
    // Without the custom converter this throws at startup:
    // "Date cannot be represented in JSON Schema".
    app = await createTestApp({ controllers: [DatesTestController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('describes z.coerce.date() as an ISO 8601 string', () => {
    const doc = createOpenApiDocument(app);
    const body = doc.paths['/__dates']?.post?.requestBody as {
      content: Record<
        string,
        { schema: { properties: Record<string, unknown> } }
      >;
    };

    expect(
      body.content['application/json']!.schema.properties['occurredAt'],
    ).toEqual({ type: 'string', format: 'date-time' });
  });
});
