const formats = new Map<string, Intl.NumberFormat>();

function format(currency: string): Intl.NumberFormat {
  let known = formats.get(currency);
  if (!known) {
    known = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      // Amounts are kept with 2 digits in every currency, yen included
      // (whose own format has none: a minimum of 2 alone would throw).
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formats.set(currency, known);
  }
  return known;
}

/**
 * "1234.5", "RUB" -> "1 234,50 ₽"; "USD" -> "1 234,50 $". Display only:
 * amounts arrive as exact decimal strings, totals are computed by the API,
 * and Number() here never takes part in arithmetic. Up to 14 significant
 * digits survive the conversion.
 */
export function formatMoney(amount: string, currency: string): string {
  // Intl writes a hyphen; a negative balance gets the typographic minus,
  // the same one as expenses in the list.
  return format(currency).format(Number(amount)).replace('-', '−');
}

/** Expense as "−1 234,50 ₽", income as "+1 234,50 ₽". */
export function formatSignedMoney(
  amount: string,
  kind: 'income' | 'expense',
  currency: string,
): string {
  return `${kind === 'income' ? '+' : '−'}${formatMoney(amount, currency)}`;
}

/** "₽", "$", "€", or the code where there is no sign: for a field's suffix. */
export function currencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
    })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency
  );
}
