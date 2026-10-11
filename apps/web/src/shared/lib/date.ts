const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Value for <input type="datetime-local"> in the user's time zone.
 * new Date("2026-10-11T14:30") parses such a value back as local time, so
 * the date the user picked is the date that is stored.
 */
export function toDateTimeLocal(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** [start of the month, start of the next month) in local time. */
export function monthRange(date = new Date()): { from: Date; to: Date } {
  return {
    from: new Date(date.getFullYear(), date.getMonth(), 1),
    to: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}

const dayFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const monthFormat = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
});

const dayMonthFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
});

const weekdayFormat = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' });

const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
});

export const formatDay = (iso: string) => dayFormat.format(new Date(iso));

export const formatMonth = (date: Date) => monthFormat.format(date);

/** "14:30" in the user's time zone. */
export const formatTime = (iso: string) => timeFormat.format(new Date(iso));

/** The local calendar day, "2026-10-05": groups transactions by day. */
export const dayKey = (iso: string) =>
  toDateTimeLocal(new Date(iso)).slice(0, 10);

/**
 * "Сегодня", "Вчера", "5 октября, воскресенье"; the year only when it is
 * not the current one.
 */
export function formatDayHeading(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const days = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000,
  );
  if (days === 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  const day =
    date.getFullYear() === now.getFullYear()
      ? dayMonthFormat.format(date)
      : dayFormat.format(date);
  return `${day}, ${weekdayFormat.format(date)}`;
}

// Math.round above absorbs a 23- or 25-hour day at a DST switch.
const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());
