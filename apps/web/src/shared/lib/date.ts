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

export const formatDay = (iso: string) => dayFormat.format(new Date(iso));

export const formatMonth = (date: Date) => monthFormat.format(date);
