import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { AppConfigService } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const config = app.get<AppConfigService>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
