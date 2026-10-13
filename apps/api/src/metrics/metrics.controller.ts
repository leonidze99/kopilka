import { Controller, Get, HttpStatus, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import type { Env } from '../config/env.js';
import { MetricsService } from './metrics.service.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/**
 * Prometheus scrape endpoint, outside the API contract (hence hidden from
 * the OpenAPI document): it is for whoever runs the app, not for clients.
 *
 * Who may read it: with METRICS_TOKEN set, only a scraper sending it as a
 * bearer token; without the variable, anyone in development, nobody in
 * production. The numbers say which routes exist, how often they are
 * called and how big the process is — not a secret, but not public either.
 * A wrong or missing token gets 404 rather than 401, so a scan cannot tell
 * the endpoint is there at all.
 */
@Controller('metrics')
export class MetricsController {
  private readonly token: string | undefined;
  private readonly isProduction: boolean;

  constructor(
    private readonly metrics: MetricsService,
    config: ConfigService<Env, true>,
  ) {
    this.token = config.get('METRICS_TOKEN', { infer: true });
    this.isProduction =
      config.get('NODE_ENV', { infer: true }) === 'production';
  }

  @Public()
  @SkipThrottle()
  @ApiExcludeEndpoint()
  @Get()
  async scrape(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string | undefined> {
    if (!this.allowed(req)) {
      res.status(HttpStatus.NOT_FOUND);
      return undefined;
    }
    res.type(this.metrics.registry.contentType);
    return this.metrics.render();
  }

  private allowed(req: Request): boolean {
    if (!this.token) return !this.isProduction;

    const presented = req.headers.authorization?.replace(/^Bearer /, '');
    if (!presented) return false;
    // Hashed first so both sides are the same length, then compared in
    // constant time: a byte-by-byte check leaks the token through timing.
    return timingSafeEqual(sha256(presented), sha256(this.token));
  }
}
