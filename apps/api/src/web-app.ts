import { extname, join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { API_PREFIX } from './common/http/api-prefix.js';

const YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

/**
 * Serves the built web app from the same origin as the API: the refresh
 * cookie is SameSite=Strict and must reach /api from the app's pages, and
 * there is no CORS to configure. Must run before app.init(), ahead of the
 * Nest router and its 404.
 */
export function serveWebApp(app: NestExpressApplication, dir: string): void {
  app.useStaticAssets(dir, {
    // index.html is sent by the fallback below, with its own caching.
    index: false,
    setHeaders: (res, path) => {
      // Vite puts a content hash into every file name under /assets: a
      // changed file gets a new URL, so the old one can be cached forever.
      if (path.includes(`${join(dir, 'assets')}`)) {
        res.setHeader(
          'Cache-Control',
          `public, max-age=${YEAR_IN_SECONDS}, immutable`,
        );
      }
    },
  });

  // Client-side routes (/categories, /login): any other GET that wants a
  // page gets index.html and the router of the app takes it from there.
  const apiPath = `/${API_PREFIX}/`;
  app.use((req: Request, res: Response, next: NextFunction) => {
    const isPage =
      (req.method === 'GET' || req.method === 'HEAD') &&
      !`${req.path}/`.startsWith(apiPath) &&
      // A missing /assets/app.js is a 404, not a page.
      !extname(req.path) &&
      req.accepts(['html', 'json']) === 'html';
    if (!isPage) return next();
    // Always revalidated: it names the current hashed bundles.
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(join(dir, 'index.html'));
  });
}
