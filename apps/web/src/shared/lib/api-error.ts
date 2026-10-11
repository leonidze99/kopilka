import { type ApiError, apiErrorSchema } from '@kopilka/shared';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

/**
 * The API error body, if `error` (as returned by RTK Query) carries one.
 * Validated with the same Zod schema the API uses to build it.
 */
export function toApiError(error: unknown): ApiError | undefined {
  if (typeof error !== 'object' || error === null || !('data' in error)) {
    return undefined;
  }
  const parsed = apiErrorSchema.safeParse(error.data);
  return parsed.success ? parsed.data : undefined;
}

const isNetworkError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'status' in error &&
  error.status === 'FETCH_ERROR';

/** A message to show the user, in Russian, for any failed request. */
export function errorMessage(error: unknown): string {
  if (isNetworkError(error)) {
    return 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.';
  }
  const apiError = toApiError(error);
  if (!apiError) return 'Что-то пошло не так. Попробуйте ещё раз.';

  switch (apiError.code) {
    case 'INVALID_CREDENTIALS':
      return 'Неверный email или пароль';
    case 'RATE_LIMITED':
      return 'Слишком много попыток. Попробуйте через минуту.';
    case 'VALIDATION_FAILED':
      return 'Проверьте правильность заполнения полей';
    case 'SERVICE_UNAVAILABLE':
      return 'Сервис временно недоступен. Попробуйте позже.';
    case 'INTERNAL_ERROR':
      // The id lets support find the exact request in the server logs.
      return `Что-то пошло не так. Код запроса: ${apiError.requestId}`;
    default:
      return apiError.message;
  }
}

/**
 * Puts field-level API errors (`details[].field`, e.g. "email") under the
 * matching inputs and everything else into `errors.root.server`.
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): void {
  const apiError = toApiError(error);
  let placedOnField = false;
  for (const detail of apiError?.details ?? []) {
    const field = fields.find((f) => f === detail.field);
    if (field) {
      setError(field, { type: 'server', message: detail.message });
      placedOnField = true;
    }
  }
  if (!placedOnField) {
    setError('root.server', { type: 'server', message: errorMessage(error) });
  }
}
