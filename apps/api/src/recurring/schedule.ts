/**
 * Calendar arithmetic on "YYYY-MM-DD" strings: dates of payments are days,
 * not instants, so there is no time zone in here. The zone comes in only
 * to tell which day it is now (todayIn).
 */

const parse = (date: string) =>
  date.split('-').map(Number) as [number, number, number];

const format = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const daysIn = (year: number, month: number) =>
  // Day 0 of the next month is the last day of this one.
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The date `months` months after `date`, on the same day or on the last day
 * of a shorter month. Always counted from the anchor: Jan 31 + 1 = Feb 28,
 * Jan 31 + 2 = Mar 31 (stepping month by month would drift to Mar 28).
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = parse(date);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  return format(
    targetYear,
    targetMonth,
    Math.min(day, daysIn(targetYear, targetMonth)),
  );
}

/** "2026-10-31" + 1 day = "2026-11-01". */
export function addDays(date: string, days: number): string {
  const [year, month, day] = parse(date);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return format(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}

/** The date it is in a time zone at an instant, "2026-10-12". */
export function todayIn(timeZone: string, now: Date): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The first occurrence of a monthly schedule from `start` that falls on or
 * after `from`: its number and date. Dates in this format compare as
 * strings.
 */
export function firstOnOrAfter(
  start: string,
  from: string,
): { index: number; on: string } {
  // Whole months between the two, then step over the few left.
  const [startYear, startMonth] = parse(start);
  const [fromYear, fromMonth] = parse(from);
  let index = Math.max(
    0,
    (fromYear - startYear) * 12 + (fromMonth - startMonth) - 1,
  );
  while (addMonths(start, index) < from) index++;
  return { index, on: addMonths(start, index) };
}

/** A date column comes back as UTC midnight: Date -> "2026-10-05". */
export const dateOf = (value: Date) => value.toISOString().slice(0, 10);

/** "2026-10-05" -> the Date Prisma writes into a date column. */
export const toDateColumn = (date: string) => new Date(`${date}T00:00:00Z`);
