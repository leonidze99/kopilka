import { z } from 'zod';
import { accountRefSchema } from './account.js';
import { amountSchema } from './money.js';
import { calendarDateSchema } from './recurring.js';

export const goalInputSchema = z
  .object({
    /**
     * The account that holds the money. What is saved is its balance, so
     * one account can carry one goal.
     */
    accountId: z.uuid('Выберите счёт'),
    name: z
      .string()
      .trim()
      .min(1, 'Введите название')
      .max(64, 'Не длиннее 64 символов'),
    targetAmount: amountSchema,
    /** When it should be reached; without it the goal has no deadline. */
    targetDate: calendarDateSchema.nullish(),
  })
  .meta({ id: 'GoalInput' });

export const goalSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    account: accountRefSchema,
    targetAmount: z.string(),
    targetDate: calendarDateSchema.nullable(),
    /** The balance of the account right now. */
    saved: z.string(),
    /** What is left to put aside; "0.00" once the goal is reached. */
    remaining: z.string(),
    /** 0..100, rounded down; 100 means reached. */
    percent: z.number().int(),
    /**
     * What to put aside every month to make the date, counting this month.
     * null without a date, once the goal is reached, or when the date has
     * passed — nothing monthly would help then.
     */
    monthly: z.string().nullable(),
  })
  .meta({ id: 'Goal' });

export const goalListSchema = z.array(goalSchema).meta({ id: 'GoalList' });

export type GoalInputDto = z.infer<typeof goalInputSchema>;
export type Goal = z.infer<typeof goalSchema>;
