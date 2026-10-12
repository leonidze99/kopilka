const nextFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  // The date is a calendar day: read it as is, not shifted by a zone.
  timeZone: 'UTC',
});

/** "2026-11-05" -> "5 ноября". */
export const formatPaymentDay = (date: string) =>
  nextFormat.format(new Date(`${date}T00:00:00Z`));

/**
 * "каждое 5-е число"; from the 29th on a shorter month takes its last day,
 * and the text says so.
 */
export function describeSchedule(startOn: string): string {
  const day = Number(startOn.slice(8, 10));
  return day > 28
    ? `каждое ${day}-е число или последний день месяца`
    : `каждое ${day}-е число`;
}
