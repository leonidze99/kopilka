import type { Prisma } from '../generated/prisma/client.js';

const formats = new Map<string, Intl.NumberFormat>();

/**
 * "1 234,50 ₽", "12,00 $": for messages and letters a person reads. The
 * currency decides the sign; the amounts the API returns stay plain decimal
 * strings for the client to format.
 */
export function formatMoney(
  amount: Prisma.Decimal | number,
  currency: string,
): string {
  let format = formats.get(currency);
  if (!format) {
    format = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      // Amounts are kept with 2 digits in every currency, yen included
      // (whose own format has none: min 2 alone would throw).
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formats.set(currency, format);
  }
  return format.format(Number(amount));
}
