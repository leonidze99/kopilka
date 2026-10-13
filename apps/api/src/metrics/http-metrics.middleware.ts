import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { API_PREFIX } from '../common/http/api-prefix.js';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    // On finish, not here: which route matched is only known once the
    // router has picked a handler.
    res.once('finish', () => {
      const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.observe({
        method: req.method,
        route: routeLabel(req),
        status: res.statusCode,
        seconds,
      });
    });
    next();
  }
}

/**
 * The route pattern (`/api/transactions/:id`), never the URL: a label per
 * id would add a time series per record, which is how a metrics backend is
 * brought down. Everything the router did not match is two fixed labels
 * instead: requests to the API that hit nothing, and the web app (its pages
 * and assets, which this process also serves).
 */
function routeLabel(req: Request): string {
  // Nest answers an unknown path from a catch-all route ("*path"), so a
  // pattern with a wildcard in it means "nothing matched" as well.
  const pattern = req.route?.path;
  if (typeof pattern === 'string' && !pattern.includes('*')) return pattern;
  // originalUrl, not path: inside middleware mounted on a router path is
  // relative to the mount point and would never show the global prefix.
  const path = req.originalUrl.split('?')[0] ?? '';
  return path.startsWith(`/${API_PREFIX}/`) ? 'unmatched' : 'web';
}
