import { z } from 'zod';
import { accountRefSchema } from './account.js';
import { categorySchema, transactionKindSchema } from './category.js';
import { amountSchema } from './money.js';

/**
 * Income and expense take their kind from the category; a transfer moves
 * money between two accounts of the user and has no category, so it never
 * counts as income or expense.
 */
export const transactionTypeSchema = z
  .enum(['income', 'expense', 'transfer'])
  .meta({ id: 'TransactionType' });

const inputFields = {
  accountId: z.uuid('Выберите счёт'),
  amount: amountSchema,
  // Dates come over JSON as strings.
  occurredAt: z.coerce.date('Укажите дату'),
  comment: z
    .string()
    .trim()
    .max(280, 'Комментарий не длиннее 280 символов')
    .optional(),
};

/**
 * The whole transaction, for create (POST) and replace (PUT): an edit may
 * turn an expense into a transfer, which a partial update cannot express
 * without a field-by-field matrix of what may combine with what.
 * `type` of income/expense must match the kind of the category.
 */
export const transactionInputSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: transactionKindSchema,
        categoryId: z.uuid('Выберите категорию'),
        ...inputFields,
      })
      .meta({ id: 'CategorizedTransactionInput' }),
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
      .meta({ id: 'TransferInput' }),
  ])
  .meta({ id: 'TransactionInput' });

const outputFields = {
  id: z.uuid(),
  /** Always positive, with 2 fraction digits, e.g. "1234.50". */
  amount: z.string(),
  comment: z.string().nullable(),
  // coerce: in JSON a date is a string; the same schema must also
  // parse a response on the client.
  occurredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  /** For a transfer: the account the money left. */
  account: accountRefSchema,
  /** Made by this recurring rule; null for one entered by hand. */
  recurringRuleId: z.uuid().nullable(),
};

export const transactionSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: transactionKindSchema,
        ...outputFields,
        category: categorySchema,
      })
      .meta({ id: 'CategorizedTransaction' }),
    z
      .object({
        type: z.literal('transfer'),
        ...outputFields,
        toAccount: accountRefSchema,
      })
      .meta({ id: 'Transfer' }),
  ])
  .meta({ id: 'Transaction' });

export const listTransactionsQuerySchema = z.object({
  /** Opaque, from `nextCursor` of the previous page. */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Inclusive. */
  from: z.coerce.date().optional(),
  /** Exclusive. */
  to: z.coerce.date().optional(),
  categoryId: z.uuid().optional(),
  /** Money that left or reached the account: transfers count for both. */
  accountId: z.uuid().optional(),
  type: transactionTypeSchema.optional(),
});

export const transactionPageSchema = z
  .object({
    items: z.array(transactionSchema),
    /** Pass as `cursor` for the next page; null on the last page. */
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'TransactionPage' });

export const transactionSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const transactionSummarySchema = z
  .object({
    income: z.string(),
    expense: z.string(),
    /** income - expense; may be negative. */
    balance: z.string(),
  })
  .meta({ id: 'TransactionSummary' });

export const categoryTotalsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Which side to break down; expenses by default. */
  kind: transactionKindSchema.default('expense'),
});

export const categoryTotalSchema = z
  .object({
    category: categorySchema,
    /** Sum over the period, always with 2 fraction digits. */
    total: z.string(),
  })
  .meta({ id: 'CategoryTotal' });

export const categoryTotalsSchema = z
  .array(categoryTotalSchema)
  .meta({ id: 'CategoryTotals' });

export type TransactionType = z.infer<typeof transactionTypeSchema>;
export type TransactionInputDto = z.infer<typeof transactionInputSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type TransactionPage = z.infer<typeof transactionPageSchema>;
export type TransactionSummaryQuery = z.infer<
  typeof transactionSummaryQuerySchema
>;
export type TransactionSummary = z.infer<typeof transactionSummarySchema>;
export type CategoryTotalsQuery = z.infer<typeof categoryTotalsQuerySchema>;
export type CategoryTotal = z.infer<typeof categoryTotalSchema>;
