import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, HttpMetricsMiddleware],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Every request, the ones no route matches included: Express 5 wants a
    // named wildcard, so '*' alone would be a path-to-regexp error.
    consumer.apply(HttpMetricsMiddleware).forRoutes('{*splat}');
  }
}
