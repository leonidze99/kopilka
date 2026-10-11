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
import { randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import { AppException } from './app.exception.js';

type ErrorBody = Omit<ApiError, 'requestId'>;

const INTERNAL_ERROR: ErrorBody = {
  code: 'INTERNAL_ERROR',
  message: 'Internal server error',
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
    const requestId = request.id ?? randomUUID();

    const [status, body] = this.toError(exception);
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed [requestId=${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
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
