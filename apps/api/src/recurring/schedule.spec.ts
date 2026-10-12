import { addMonths, firstOnOrAfter, todayIn } from './schedule.js';

describe('schedule', () => {
  describe('addMonths', () => {
    it.each([
      ['2026-10-05', 1, '2026-11-05'],
      ['2026-11-15', 2, '2027-01-15'],
      // A shorter month takes its last day...
      ['2026-01-31', 1, '2026-02-28'],
      ['2028-01-31', 1, '2028-02-29'],
      ['2026-01-31', 3, '2026-04-30'],
      // ...and the next one is back on the 31st: counted from the anchor.
      ['2026-01-31', 2, '2026-03-31'],
      ['2026-10-05', 0, '2026-10-05'],
    ])('%s + %i months = %s', (date, months, expected) => {
      expect(addMonths(date, months)).toBe(expected);
    });
  });

  describe('todayIn', () => {
    // 22:30 in UTC is already the next day in Moscow (UTC+3).
    const now = new Date('2026-10-11T22:30:00Z');

    it.each([
      ['UTC', '2026-10-11'],
      ['Europe/Moscow', '2026-10-12'],
      ['America/New_York', '2026-10-11'],
    ])('in %s it is %s', (zone, expected) => {
      expect(todayIn(zone, now)).toBe(expected);
    });
  });

  describe('firstOnOrAfter', () => {
    it.each([
      // A future start: the start itself.
      ['2026-11-05', '2026-10-12', 0, '2026-11-05'],
      // Today is a payment day: today.
      ['2026-10-12', '2026-10-12', 0, '2026-10-12'],
      // Past start: the next one from today, earlier ones are not made.
      ['2026-10-05', '2026-10-12', 1, '2026-11-05'],
      ['2025-01-31', '2026-03-01', 14, '2026-03-31'],
      ['2026-01-31', '2026-02-28', 1, '2026-02-28'],
    ])('from %s, on or after %s: #%i, %s', (start, from, index, on) => {
      expect(firstOnOrAfter(start, from)).toEqual({ index, on });
    });
  });
});
