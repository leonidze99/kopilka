import { z } from 'zod';
import { categorySchema } from './category.js';
import { amountSchema } from './money.js';

/** A calendar month, "2026-10". */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Месяц в формате ГГГГ-ММ')
  .meta({ id: 'Month', example: '2026-10' });

export const budgetsQuerySchema = z.object({
  /** Which limits apply: the latest version from this month or earlier. */
  month: monthSchema,
  /**
   * Bounds of that month in the user's time zone, for what was spent: only
   * the client knows the zone (as with /transactions/summary).
   */
  from: z.coerce.date(),
  to: z.coerce.date(),
});

/** Limit, spent and remaining: decimal strings; remaining may be negative. */
const usageFields = {
  limit: z.string(),
  spent: z.string(),
  remaining: z.string(),
};

export const budgetSchema = z
  .object({
    category: categorySchema,
    ...usageFields,
    /** The month this limit has applied since. */
    since: monthSchema,
  })
  .meta({ id: 'Budget' });

export const budgetListSchema = z
  .object({
    /** The categories with a limit in the month, by name. */
    items: z.array(budgetSchema),
    /** Over the budgeted categories only, summed exactly by the server. */
    total: z.object(usageFields),
  })
  .meta({ id: 'BudgetList' });

/**
 * A limit from `month` on, until the next change. `amount: null` stops
 * budgeting the category from that month; earlier months keep theirs.
 */
export const setBudgetSchema = z
  .object({
    month: monthSchema,
    amount: amountSchema.nullable(),
  })
  .meta({ id: 'SetBudgetRequest' });

/** The form behind PUT /budgets/:categoryId: the category goes into the URL. */
export const budgetFormSchema = z.object({
  categoryId: z.uuid('Выберите категорию'),
  amount: amountSchema,
});

export type BudgetsQuery = z.infer<typeof budgetsQuerySchema>;
export type Budget = z.infer<typeof budgetSchema>;
export type BudgetList = z.infer<typeof budgetListSchema>;
export type SetBudgetDto = z.infer<typeof setBudgetSchema>;
