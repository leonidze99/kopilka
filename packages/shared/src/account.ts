import { z } from 'zod';
import { currencySchema } from './currency.js';
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
    /** Every amount on the account is in it. */
    currency: currencySchema,
  })
  .meta({ id: 'AccountRef' });

export const accountSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    type: accountTypeSchema,
    /** The balance and every amount on the account are in it. */
    currency: currencySchema,
    /** What was there before the first transaction, e.g. "1500.00". */
    openingBalance: z.string(),
    /** false: no write may take the balance below zero. */
    allowNegative: z.boolean(),
    /**
     * Not stored: the opening balance plus income, minus expenses,
     * minus transfers out, plus transfers in.
     */
    balance: z.string(),
    /**
     * When it went to the archive; null: in use. An archived account had
     * nothing left on it, takes no new transactions, rules or goals, and
     * keeps its history.
     */
    // coerce: in JSON a date is a string; the client parses responses too.
    archivedAt: z.coerce.date().nullable(),
  })
  .meta({ id: 'Account' });

export const archiveAccountResultSchema = z
  .object({
    account: accountSchema,
    /** Recurring rules of the account that were active and are stopped now. */
    stoppedRecurring: z.number().int(),
  })
  .meta({ id: 'ArchiveAccountResult' });

export const accountListSchema = z
  .object({
    /** Oldest first. */
    items: z.array(accountSchema),
    /**
     * All balances together in the user's base currency, each converted
     * at the latest Bank of Russia rate; null when a rate is missing.
     */
    total: z.string().nullable(),
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
    /** The user's base currency if left out. */
    currency: currencySchema.optional(),
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
 * depends on the transactions. The currency changes only while the account
 * has no transactions and no recurring rules: their amounts are in it.
 */
export const updateAccountSchema = z
  .object({
    name: accountNameSchema.optional(),
    type: accountTypeSchema.optional(),
    currency: currencySchema.optional(),
    openingBalance: signedAmountSchema.optional(),
    allowNegative: z.boolean().optional(),
  })
  .meta({ id: 'UpdateAccountRequest' });

export type AccountType = z.infer<typeof accountTypeSchema>;
export type AccountRef = z.infer<typeof accountRefSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountList = z.infer<typeof accountListSchema>;
export type ArchiveAccountResult = z.infer<typeof archiveAccountResultSchema>;
export type CreateAccountDto = z.infer<typeof createAccountSchema>;
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;
