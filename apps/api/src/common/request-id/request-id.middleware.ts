import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
  }
}

export const REQUEST_ID_HEADER = 'X-Request-ID';

// The id ends up in logs and response headers: accept only a safe,
// bounded format from the client to rule out log injection.
const VALID_REQUEST_ID = /^[\w-]{1,128}$/;

/**
 * Reuses the X-Request-ID sent by the client (e.g. the frontend) or
 * generates one, and echoes it back so both sides can correlate the request.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incoming = req.header(REQUEST_ID_HEADER);
  const id =
    incoming && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
