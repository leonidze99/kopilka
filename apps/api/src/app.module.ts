import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { minutes, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { createValidationPipe } from './common/errors/validation.pipe.js';
import { createLoggerParams } from './common/logging/logger.config.js';
import { HealthModule } from './health/health.module.js';
import { envSchema, type Env } from './config/env.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: envSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createLoggerParams({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          LOG_LEVEL: config.get('LOG_LEVEL', { infer: true }),
        }),
    }),
    // Per client IP, in memory: fine for a single instance. With several
    // instances the counters must be shared (Redis storage).
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: minutes(1), limit: 100 }],
      errorMessage: 'Too many requests, try again later',
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Registered as providers rather than in main.ts so that tests
    // building the app from AppModule get the same behavior.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
    // useExisting lets tests swap the guard via overrideProvider(ThrottlerGuard).
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule {}
