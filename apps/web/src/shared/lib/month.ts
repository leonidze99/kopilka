/** A calendar month in the user's time zone, "2026-10": fits a URL as is. */
export type Month = `${number}-${number}`;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const toMonth = (date: Date): Month =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` as Month;

export const currentMonth = (now = new Date()) => toMonth(now);

/** A month from a URL; anything else (missing, "2026-13") is null. */
export function parseMonth(value: string | null): Month | null {
  return value && MONTH_PATTERN.test(value) ? (value as Month) : null;
}

const firstDay = (month: Month, offset = 0) => {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return new Date(year, index - 1 + offset, 1);
};

export const shiftMonth = (month: Month, by: number) =>
  toMonth(firstDay(month, by));

/** [the 1st of the month, the 1st of the next one) in local time, as ISO. */
export function monthPeriod(month: Month): { from: string; to: string } {
  return {
    from: firstDay(month).toISOString(),
    to: firstDay(month, 1).toISOString(),
  };
}

const titleFormat = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
});

const nameFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long' });

/** "Октябрь 2026": a title. */
export function formatMonthTitle(month: Month): string {
  // "октябрь 2026 г." -> "Октябрь 2026"
  const text = titleFormat.format(firstDay(month)).replace(/\s*г\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "октябре": for "в октябре". */
export function formatMonthIn(month: Month): string {
  const name = nameFormat.format(firstDay(month));
  // Prepositional case: январь -> январе, май -> мае, март -> марте.
  return name.replace(/ь$|й$/, '') + 'е';
}
