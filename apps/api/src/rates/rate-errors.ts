import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';

/**
 * The text of an error and of everything it wraps: Prisma puts what
 * Postgres said into the message, the meta or the cause, depending on the
 * query and the adapter.
 */
function texts(error: unknown, depth = 0): string {
  if (!error || typeof error !== 'object' || depth > 3) return '';
  const { message, meta, cause } = error as {
    message?: unknown;
    meta?: unknown;
    cause?: unknown;
  };
  return [
    typeof message === 'string' ? message : '',
    meta ? JSON.stringify(meta) : '',
    texts(cause, depth + 1),
  ].join('\n');
}

/**
 * The transactions_money trigger refused a write: there is no Bank of
 * Russia rate for a currency on the day (see the migration currencies).
 */
export const isExchangeRateMissing = (error: unknown) =>
  texts(error).includes('EXCHANGE_RATE_MISSING');

/**
 * What the user is told. On a transaction it can be fixed by giving the
 * amount in the base currency by hand.
 */
export const exchangeRateMissing = (
  field = 'baseAmount',
  message = 'Нет курса ЦБ на эту дату — укажите сумму в основной валюте или попробуйте позже',
) =>
  new AppException(
    'EXCHANGE_RATE_UNAVAILABLE',
    'No Bank of Russia rate to convert with',
    HttpStatus.CONFLICT,
    [{ field, message }],
  );
