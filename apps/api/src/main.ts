import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { AppConfigService } from './config/env.js';

async function bootstrap() {
  // Buffer startup logs until the pino logger is resolved from DI,
  // so they come out in the same format as everything else.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const config = app.get<AppConfigService>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
