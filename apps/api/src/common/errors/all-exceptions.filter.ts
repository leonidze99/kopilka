import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError, ErrorCode } from '@kopilka/shared';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { resolveRequestId } from '../logging/logger.config.js';
import { AppException } from './app.exception.js';

type ErrorBody = Omit<ApiError, 'requestId'>;

const INTERNAL_ERROR: ErrorBody = {
  code: 'INTERNAL_ERROR',
  message: 'Internal server error',
};

const SERVICE_UNAVAILABLE: ErrorBody = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'Service unavailable',
};

function codeByStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

function httpExceptionMessage(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') return response;
  const { message } = response as { message?: unknown };
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : exception.message;
}

/**
 * Errors thrown by body-parser and other http-errors based middleware,
 * e.g. 413 for an oversized body. Nest itself only converts malformed JSON
 * (SyntaxError) into a BadRequestException, everything else arrives as is.
 * `expose: true` marks a message as safe to show to the client.
 */
function isExposableHttpError(
  error: unknown,
): error is { status: number; message: string } {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status < 500 && expose === true;
}

/**
 * Turns any thrown value into `{ code, message, details?, requestId }`
 * with a matching HTTP status. 5xx never leak internal details to the
 * client; the full error is logged instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const [status, body] = this.toError(exception);

    // Errors raised by body-parser (malformed JSON, oversized body) happen
    // before the pino-http middleware runs: there is no request id yet and
    // no access log line will be written, so both are done here.
    let requestId = request.id;
    if (typeof requestId !== 'string') {
      requestId = resolveRequestId(request, response);
      this.logger.warn({
        reqId: requestId,
        // Flat keys on purpose: pino-http serializers would rewrite req/res.
        method: request.method,
        url: request.originalUrl,
        statusCode: status,
        msg: `Request rejected before routing: ${body.message}`,
      });
    }

    // Inside a request pino binds reqId to every log line, so the stack
    // trace and the access log line can be joined by it.
    // 503 is thrown on purpose (e.g. a failed readiness check) by code that
    // logs the reason itself; its stack trace would only add noise.
    if (status >= 500 && status !== 503) {
      this.logger.error(
        exception instanceof Error
          ? exception
          : { thrown: exception, msg: 'Non-error value thrown' },
      );
    }

    response.status(status).json({ ...body, requestId } satisfies ApiError);
  }

  private toError(exception: unknown): [number, ErrorBody] {
    if (exception instanceof AppException) {
      return [
        exception.getStatus(),
        {
          code: exception.code,
          message: exception.message,
          details: exception.details,
        },
      ];
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Details of 5xx (e.g. which health check failed) stay in the logs.
      if (status === 503) return [status, SERVICE_UNAVAILABLE];
      if (status >= 500) return [status, INTERNAL_ERROR];
      return [
        status,
        {
          code: codeByStatus(status),
          message: httpExceptionMessage(exception),
        },
      ];
    }

    // Fallback for database errors a service did not translate itself.
    // With driver adapters Prisma reports the violated index, not the fields,
    // so field-level messages belong in the service via AppException.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return [
            HttpStatus.CONFLICT,
            { code: 'CONFLICT', message: 'Resource already exists' },
          ];
        case 'P2003':
          return [
            HttpStatus.CONFLICT,
            {
              code: 'CONFLICT',
              message: 'Operation violates a reference to another resource',
            },
          ];
        case 'P2025':
          return [
            HttpStatus.NOT_FOUND,
            { code: 'NOT_FOUND', message: 'Resource not found' },
          ];
      }
    }

    if (isExposableHttpError(exception)) {
      return [
        exception.status,
        { code: codeByStatus(exception.status), message: exception.message },
      ];
    }

    return [HttpStatus.INTERNAL_SERVER_ERROR, INTERNAL_ERROR];
  }
}
