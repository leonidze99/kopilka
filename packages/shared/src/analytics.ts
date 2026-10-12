import { z } from 'zod';
import { monthSchema } from './budget.js';
import { timeZoneSchema } from './recurring.js';

/** Months in one request at most: three years of bars is already a lot. */
export const MONTHLY_TOTALS_MAX_MONTHS = 36;

const monthIndex = (month: string) => {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return year * 12 + number - 1;
};

export const monthlyTotalsQuerySchema = z
  .object({
    /** The first month, included. */
    from: monthSchema,
    /** The last month, included. */
    to: monthSchema,
    /**
     * Where a month begins and ends: a transaction at 01:00 on November 1st
     * in Moscow is still October 31st in UTC.
     */
    timeZone: timeZoneSchema,
  })
  .refine(({ from, to }) => from <= to, {
    message: 'Начало периода позже конца',
    path: ['to'],
  })
  .refine(
    ({ from, to }) =>
      monthIndex(to) - monthIndex(from) < MONTHLY_TOTALS_MAX_MONTHS,
    {
      message: `Не больше ${MONTHLY_TOTALS_MAX_MONTHS} месяцев`,
      path: ['from'],
    },
  );

export const monthlyTotalSchema = z
  .object({
    month: monthSchema,
    income: z.string(),
    expense: z.string(),
    /** income - expense; may be negative. */
    balance: z.string(),
  })
  .meta({ id: 'MonthlyTotal' });

/** Every month of the period, oldest first; a month without transactions is zeros. */
export const monthlyTotalsSchema = z
  .array(monthlyTotalSchema)
  .meta({ id: 'MonthlyTotals' });

export type MonthlyTotalsQuery = z.infer<typeof monthlyTotalsQuerySchema>;
export type MonthlyTotal = z.infer<typeof monthlyTotalSchema>;
