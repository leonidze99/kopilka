import {
  addInterval,
  addMonths,
  firstOnOrAfter,
  type Interval,
  todayIn,
} from './schedule.js';

const MONTHLY: Interval = { every: 1, unit: 'month' };

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

  describe('addInterval', () => {
    it.each([
      // Every occurrence is counted from the start, so a weekly rule keeps
      // its weekday and a monthly one its day of the month.
      ['2026-10-05', 3, { every: 1, unit: 'week' }, '2026-10-26'],
      ['2026-10-05', 2, { every: 2, unit: 'week' }, '2026-11-02'],
      ['2026-10-05', 5, { every: 3, unit: 'day' }, '2026-10-20'],
      ['2026-01-31', 2, { every: 1, unit: 'month' }, '2026-03-31'],
      ['2026-01-31', 1, { every: 3, unit: 'month' }, '2026-04-30'],
      ['2026-10-05', 0, { every: 7, unit: 'day' }, '2026-10-05'],
    ] as [string, number, Interval, string][])(
      '%s, step %i of %o = %s',
      (start, steps, interval, expected) => {
        expect(addInterval(start, steps, interval)).toBe(expected);
      },
    );
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
      expect(firstOnOrAfter(start, from, MONTHLY)).toEqual({ index, on });
    });

    it.each([
      // Weekly: the next Monday after a start two weeks back.
      ['2026-10-05', '2026-10-12', { every: 1, unit: 'week' }, 1, '2026-10-12'],
      ['2026-10-05', '2026-10-13', { every: 1, unit: 'week' }, 2, '2026-10-19'],
      // Every other week: the odd ones are not payment days.
      ['2026-10-05', '2026-10-13', { every: 2, unit: 'week' }, 1, '2026-10-19'],
      // Every ten days, a year on: the estimate lands it in one step.
      [
        '2026-01-01',
        '2026-12-31',
        { every: 10, unit: 'day' },
        37,
        '2027-01-06',
      ],
      // Every three months from a 31st, over a shorter month.
      [
        '2026-01-31',
        '2026-05-01',
        { every: 3, unit: 'month' },
        2,
        '2026-07-31',
      ],
      // A start in the future: that start, whatever the interval.
      ['2027-01-01', '2026-10-12', { every: 5, unit: 'day' }, 0, '2027-01-01'],
    ] as [string, string, Interval, number, string][])(
      'from %s, on or after %s, every %o: #%i, %s',
      (start, from, interval, index, on) => {
        expect(firstOnOrAfter(start, from, interval)).toEqual({ index, on });
      },
    );
  });
});
