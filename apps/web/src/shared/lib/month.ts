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

const shortFormat = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

/** "окт": an axis label. */
export const formatMonthShort = (month: Month) =>
  shortFormat.format(firstDay(month)).replace('.', '');

const DATIVE = [
  'январю',
  'февралю',
  'марту',
  'апрелю',
  'маю',
  'июню',
  'июлю',
  'августу',
  'сентябрю',
  'октябрю',
  'ноябрю',
  'декабрю',
];

const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
});

/**
 * What to compare a month with: the previous month, or for the month in
 * progress the same days of the previous one. On October 12th, October so
 * far against September 1–12: a whole September would make every month
 * in progress look cheaper. `label` completes "к …".
 */
export function previousPeriod(
  month: Month,
  now = new Date(),
): { from: string; to: string; label: string } {
  const previous = shiftMonth(month, -1);
  const [, index] = previous.split('-').map(Number) as [number, number];
  if (month !== currentMonth(now)) {
    return { ...monthPeriod(previous), label: DATIVE[index - 1] ?? '' };
  }
  const start = firstDay(previous);
  const end = firstDay(previous, 1);
  // The same day and time; March 31st compares with all of February.
  const same = new Date(start);
  same.setDate(now.getDate());
  same.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  const to = same < end ? same : end;
  const lastDay = new Date(to.getTime() - 1);
  return {
    from: start.toISOString(),
    to: to.toISOString(),
    label:
      lastDay.getDate() === 1
        ? dayMonthFormat.format(lastDay)
        : `1–${dayMonthFormat.format(lastDay)}`,
  };
}

/** "октябре": for "в октябре". */
export function formatMonthIn(month: Month): string {
  const name = nameFormat.format(firstDay(month));
  // Prepositional case: январь -> январе, май -> мае, март -> марте.
  return name.replace(/ь$|й$/, '') + 'е';
}
