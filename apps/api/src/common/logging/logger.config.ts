import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';
import type { DestinationStream, LevelWithSilent } from 'pino';
import type { Options } from 'pino-http';
import type { Env } from '../../config/env.js';
import { API_PREFIX } from '../http/api-prefix.js';

export const REQUEST_ID_HEADER = 'X-Request-ID';

// The id ends up in logs and response headers: accept only a safe,
// bounded format from the client to rule out log injection.
const VALID_REQUEST_ID = /^[\w-]{1,128}$/;

/**
 * Reuses the X-Request-ID sent by the client (e.g. the frontend) or
 * generates one, and echoes it back so both sides can correlate the request.
 */
export function resolveRequestId(
  req: IncomingMessage,
  res: ServerResponse,
): string {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

const DEFAULT_LEVEL: Record<Env['NODE_ENV'], LevelWithSilent> = {
  development: 'debug',
  test: 'silent',
  production: 'info',
};

export function createLoggerParams(
  env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>,
  destination?: DestinationStream,
): Params {
  const options: Options = {
    level: env.LOG_LEVEL ?? DEFAULT_LEVEL[env.NODE_ENV],
    genReqId: resolveRequestId,
    // Logs written while handling a request carry only `reqId`
    // instead of the whole serialized request.
    quietReqLogger: true,
    // Platform health probes hit every few seconds and would drown the
    // access log; failed checks are logged by terminus itself.
    autoLogging: {
      // The same for the metrics scrape, which Prometheus repeats as often.
      ignore: (req) =>
        req.url?.startsWith(`/${API_PREFIX}/health/`) ||
        req.url === `/${API_PREFIX}/metrics`,
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
    },
    // Human-readable output locally; plain JSON lines everywhere else,
    // which is what log collectors expect.
    transport:
      env.NODE_ENV === 'development' && !destination
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
  };

  return { pinoHttp: destination ? [options, destination] : options };
}
