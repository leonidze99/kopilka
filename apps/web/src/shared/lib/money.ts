const rub = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 2,
});

/**
 * "1234.5" -> "1 234,50 ₽". Display only: amounts arrive as exact decimal
 * strings, totals are computed by the API, and Number() here never takes
 * part in arithmetic. Up to 14 significant digits survive the conversion.
 */
export function formatMoney(amount: string): string {
  return rub.format(Number(amount));
}

/** Expense as "−1 234,50 ₽", income as "+1 234,50 ₽". */
export function formatSignedMoney(
  amount: string,
  kind: 'income' | 'expense',
): string {
  return `${kind === 'income' ? '+' : '−'}${formatMoney(amount)}`;
}
