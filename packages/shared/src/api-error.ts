import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export const errorDetailSchema = z.object({
  // Dot-separated path, e.g. "items.0.amount" — matches react-hook-form field names.
  // Absent when the issue concerns the payload as a whole.
  field: z.string().optional(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  requestId: z.string(),
  details: z.array(errorDetailSchema).optional(),
});

export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
