import type { RecurringUnit } from '@kopilka/shared';
import { pluralize } from '@/shared/lib';

const nextFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  // The date is a calendar day: read it as is, not shifted by a zone.
  timeZone: 'UTC',
});

/** "2026-11-05" -> "5 ноября". */
export const formatPaymentDay = (date: string) =>
  nextFormat.format(new Date(`${date}T00:00:00Z`));

const WEEKDAY = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  timeZone: 'UTC',
});

/** Accusative, as in "раз в 2 недели": what a count reads with. */
const UNIT_FORMS: Record<RecurringUnit, readonly [string, string, string]> = {
  day: ['день', 'дня', 'дней'],
  week: ['неделю', 'недели', 'недель'],
  month: ['месяц', 'месяца', 'месяцев'],
};

/** "раз в 2 недели", "раз в месяц": the number is left out when it is one. */
export function describeInterval(every: number, unit: RecurringUnit): string {
  const [one] = UNIT_FORMS[unit];
  return every === 1
    ? `раз в ${one}`
    : `раз в ${pluralize(every, UNIT_FORMS[unit])}`;
}

/**
 * When the payments fall: every rule counts from its start, so a monthly
 * one keeps its day of the month (saying so when a shorter month cannot
 * hold it) and a weekly one its weekday.
 */
export function describeSchedule(
  startOn: string,
  every: number,
  unit: RecurringUnit,
): string {
  const interval = describeInterval(every, unit);
  if (unit === 'month') {
    const day = Number(startOn.slice(8, 10));
    const on =
      day > 28 ? `${day}-е число или последний день месяца` : `${day}-е число`;
    return `${interval}, ${on}`;
  }
  if (unit === 'week') {
    return `${interval}, ${WEEKDAY.format(new Date(`${startOn}T00:00:00Z`))}`;
  }
  return interval;
}
