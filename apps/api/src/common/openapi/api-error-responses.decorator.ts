import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { apiErrorSchema } from '@kopilka/shared';

const DESCRIPTIONS = {
  400: 'VALIDATION_FAILED or BAD_REQUEST: invalid or malformed request',
  401: 'UNAUTHORIZED: missing, invalid or expired credentials',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT: clashes with existing data',
  413: 'VALIDATION_FAILED: the file is too large',
  429: 'RATE_LIMITED: see the Retry-After header',
} as const;

type ErrorStatus = keyof typeof DESCRIPTIONS;

/** Documents error responses, all in the shared ApiError format. */
export const ApiErrorResponses = (...statuses: ErrorStatus[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        standardSchema: apiErrorSchema,
      }),
    ),
  );
