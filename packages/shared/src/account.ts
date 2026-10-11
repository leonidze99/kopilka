import { z } from 'zod';
import { signedAmountSchema } from './money.js';

/** What the money is kept in; drives the icon, not the rules. */
export const accountTypeSchema = z
  .enum(['card', 'cash', 'savings'])
  .meta({ id: 'AccountType' });

const accountNameSchema = z
  .string()
  .trim()
  .min(1, 'Введите название')
  .max(64, 'Название не длиннее 64 символов');

/** An account as other records refer to it. */
export const accountRefSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: accountTypeSchema,
  })
  .meta({ id: 'AccountRef' });

export const accountSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: accountTypeSchema,
    /** What was there before the first transaction, e.g. "1500.00". */
    openingBalance: z.string(),
    /** false: no write may take the balance below zero. */
    allowNegative: z.boolean(),
    /**
     * Not stored: the opening balance plus income, minus expenses,
     * minus transfers out, plus transfers in.
     */
    balance: z.string(),
  })
  .meta({ id: 'Account' });

export const accountListSchema = z
  .object({
    /** Oldest first. */
    items: z.array(accountSchema),
    /** All balances together, summed exactly by the server. */
    total: z.string(),
  })
  .meta({ id: 'AccountList' });

const negativeNeedsPermission = {
  message: 'Отрицательный остаток — только у счёта, которому можно в минус',
  path: ['openingBalance'],
};

export const createAccountSchema = z
  .object({
    name: accountNameSchema,
    type: accountTypeSchema,
    openingBalance: signedAmountSchema.default('0'),
    allowNegative: z.boolean().default(true),
  })
  .refine(
    ({ openingBalance, allowNegative }) =>
      allowNegative || !openingBalance.startsWith('-'),
    negativeNeedsPermission,
  )
  .meta({ id: 'CreateAccountRequest' });

/**
 * Any subset of the fields. Whether the balance may stay where it is (say,
 * allowNegative turned off while below zero) is up to the server: it
 * depends on the transactions.
 */
export const updateAccountSchema = z
  .object({
    name: accountNameSchema.optional(),
    type: accountTypeSchema.optional(),
    openingBalance: signedAmountSchema.optional(),
    allowNegative: z.boolean().optional(),
  })
  .meta({ id: 'UpdateAccountRequest' });

export type AccountType = z.infer<typeof accountTypeSchema>;
export type AccountRef = z.infer<typeof accountRefSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountList = z.infer<typeof accountListSchema>;
export type CreateAccountDto = z.infer<typeof createAccountSchema>;
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;
