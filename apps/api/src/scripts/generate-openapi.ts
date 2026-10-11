import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { AppModule } from '../app.module.js';
import { createOpenApiDocument } from '../openapi.js';

/**
 * Writes apps/api/openapi.json without starting the server. The file is
 * committed: API changes show up in review, and the frontend generates its
 * types from it without a running backend.
 *
 * Runs from dist (dist/scripts/generate-openapi.js): Nest relies on
 * decorator metadata, which plain type stripping in Node does not emit.
 */
const output = new URL('../../openapi.json', import.meta.url);

// Errors only: with the logger off, a startup failure such as an invalid
// config would exit with code 1 and no message at all.
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
const document = createOpenApiDocument(app);
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
await app.close();

console.log(`OpenAPI document written to ${output.pathname}`);
