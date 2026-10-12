const rules = new Intl.PluralRules('ru-RU');
const count = new Intl.NumberFormat('ru-RU');

/**
 * "1 операция", "3 операции", "25 операций": the Russian form for a count.
 * `forms`: for 1, for 2–4, for 5 and more.
 */
export function pluralize(
  n: number,
  [one, few, many]: readonly [string, string, string],
): string {
  const form = rules.select(n);
  const word = form === 'one' ? one : form === 'few' ? few : many;
  return `${count.format(n)} ${word}`;
}
