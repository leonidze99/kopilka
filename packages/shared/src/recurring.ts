import { z } from 'zod';
import { accountRefSchema } from './account.js';
import { categorySchema, transactionKindSchema } from './category.js';
import { amountSchema } from './money.js';

/** A calendar date, "2026-10-05": a day, not an instant. */
export const calendarDateSchema = z.iso
  .date('Дата в формате ГГГГ-ММ-ДД')
  .meta({ id: 'CalendarDate', example: '2026-10-05' });

/** An IANA zone, "Europe/Moscow"; Intl (ECMA-402) knows the valid ones. */
export const timeZoneSchema = z
  .string()
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Неизвестный часовой пояс')
  .meta({ example: 'Europe/Moscow' });

/** The step of a rule: every N days, weeks or months. */
export const recurringUnitSchema = z
  .enum(['day', 'week', 'month'])
  .meta({ id: 'RecurringUnit' });

/** How often a rule repeats, as both sides of the API pass it around. */
export const recurringIntervalFields = {
  every: z.coerce
    .number('Введите число')
    .int('Введите целое число')
    .min(1, 'Не меньше одного')
    .max(365, 'Не больше 365')
    .default(1),
  unit: recurringUnitSchema.default('month'),
};

const inputFields = {
  accountId: z.uuid('Выберите счёт'),
  amount: amountSchema,
  comment: z
    .string()
    .trim()
    .max(280, 'Комментарий не длиннее 280 символов')
    .optional(),
  /**
   * The first payment; the next ones follow every `every` `unit`s, always
   * counted from this date — so a monthly rule keeps its day of the month
   * (the last day where a month is shorter) and a weekly one its weekday.
   * Past dates are not filled in: the rule starts from today.
   */
  startOn: calendarDateSchema,
  ...recurringIntervalFields,
  /** The zone the dates are in: a payment is due when its day begins there. */
  timeZone: timeZoneSchema,
  /** false: paused, nothing is created until it is turned back on. */
  active: z.boolean().default(true),
};

/** A repeating income, expense or transfer, created by the server on its day. */
export const recurringInputSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: transactionKindSchema,
        categoryId: z.uuid('Выберите категорию'),
        ...inputFields,
      })
      .meta({ id: 'CategorizedRecurringInput' }),
    z
      .object({
        type: z.literal('transfer'),
        toAccountId: z.uuid('Выберите счёт'),
        ...inputFields,
      })
      .refine((transfer) => transfer.toAccountId !== transfer.accountId, {
        message: 'Выберите другой счёт',
        path: ['toAccountId'],
      })
      .meta({ id: 'RecurringTransferInput' }),
  ])
  .meta({ id: 'RecurringInput' });

const outputFields = {
  id: z.uuid(),
  amount: z.string(),
  comment: z.string().nullable(),
  account: accountRefSchema,
  startOn: calendarDateSchema,
  every: z.number().int(),
  unit: recurringUnitSchema,
  timeZone: z.string(),
  active: z.boolean(),
  /** The date of the next payment. */
  nextOn: calendarDateSchema,
  /**
   * Why the latest payment was skipped (e.g. the account must not go
   * negative), until a later one goes through.
   */
  lastError: z.string().nullable(),
};

export const recurringRuleSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: transactionKindSchema,
        ...outputFields,
        category: categorySchema,
      })
      .meta({ id: 'CategorizedRecurringRule' }),
    z
      .object({
        type: z.literal('transfer'),
        ...outputFields,
        toAccount: accountRefSchema,
      })
      .meta({ id: 'RecurringTransferRule' }),
  ])
  .meta({ id: 'RecurringRule' });

export const recurringRuleListSchema = z
  .array(recurringRuleSchema)
  .meta({ id: 'RecurringRuleList' });

export type RecurringUnit = z.infer<typeof recurringUnitSchema>;
export type RecurringInputDto = z.infer<typeof recurringInputSchema>;
export type RecurringRule = z.infer<typeof recurringRuleSchema>;
