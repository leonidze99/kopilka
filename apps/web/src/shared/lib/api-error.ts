import { type ApiError, apiErrorSchema } from '@kopilka/shared';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { pluralize } from './plural';

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

/** Seconds to wait, from Retry-After (base-query copies it onto the error). */
export function retryAfterOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const value = (error as { retryAfter?: unknown }).retryAfter;
  return typeof value === 'number' && value > 0 ? value : undefined;
}

/** "через 45 секунд", "через 2 минуты"; a minute when the API did not say. */
function waitFor(seconds: number | undefined): string {
  if (seconds === undefined) return 'через минуту';
  if (seconds < 60) {
    return `через ${pluralize(seconds, ['секунду', 'секунды', 'секунд'])}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `через ${pluralize(minutes, ['минуту', 'минуты', 'минут'])}`;
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
    case 'ACCOUNT_LOCKED':
      // The API says how long the wait is.
      return (
        apiError.details?.[0]?.message ??
        'Слишком много неудачных попыток входа. Попробуйте позже.'
      );
    case 'INVALID_RESET_TOKEN':
      return (
        apiError.details?.[0]?.message ??
        'Ссылка недействительна или устарела. Запросите новую.'
      );
    case 'RATE_LIMITED':
      return `Слишком много попыток. Попробуйте ${waitFor(retryAfterOf(error))}.`;
    case 'VALIDATION_FAILED':
      return 'Проверьте правильность заполнения полей';
    case 'SERVICE_UNAVAILABLE':
      return 'Сервис временно недоступен. Попробуйте позже.';
    case 'CATEGORY_IN_USE':
      return 'В категории есть операции. Сначала удалите их или перенесите в другую категорию.';
    case 'ACCOUNT_IN_USE':
      return 'По счёту есть операции. Сначала удалите их или перенесите на другой счёт.';
    case 'INSUFFICIENT_FUNDS':
      // The API names the account and the shortfall.
      return apiError.details?.[0]?.message ?? 'На счёте не хватает денег';
    case 'ACCOUNT_NOT_EMPTY':
      // The API says how much is left on it.
      return (
        apiError.details?.[0]?.message ??
        'На счёте остались деньги — сначала переведите остаток'
      );
    case 'EXCHANGE_RATE_UNAVAILABLE':
      // The API says what to do instead: give the amount by hand, or wait.
      return (
        apiError.details?.[0]?.message ?? 'Нет курса ЦБ. Попробуйте позже.'
      );
    case 'NOT_FOUND':
      return 'Запись не найдена: возможно, её уже удалили.';
    case 'CONFLICT':
      return 'Такая запись уже существует';
    case 'INTERNAL_ERROR':
      // The id lets support find the exact request in the server logs.
      return `Что-то пошло не так. Код запроса: ${apiError.requestId}`;
    default:
      // apiError.message is meant for developers and is in English.
      return 'Не удалось выполнить действие. Попробуйте ещё раз.';
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
