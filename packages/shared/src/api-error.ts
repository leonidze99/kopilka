import { z } from 'zod';

// `.meta({ id })` names the schema in the generated OpenAPI document, so the
// frontend gets components['schemas']['ApiError'] instead of an inline type.

export const errorCodeSchema = z
  .enum([
    'BAD_REQUEST',
    'VALIDATION_FAILED',
    'UNAUTHORIZED',
    'INVALID_CREDENTIALS',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'CATEGORY_IN_USE',
    'RATE_LIMITED',
    'SERVICE_UNAVAILABLE',
    'INTERNAL_ERROR',
  ])
  .meta({ id: 'ErrorCode' });

export const errorDetailSchema = z
  .object({
    // Dot-separated path, e.g. "items.0.amount" — matches react-hook-form field names.
    // Absent when the issue concerns the payload as a whole.
    field: z.string().optional(),
    message: z.string(),
  })
  .meta({ id: 'ErrorDetail' });

export const apiErrorSchema = z
  .object({
    code: errorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    details: z.array(errorDetailSchema).optional(),
  })
  .meta({ id: 'ApiError' });

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
