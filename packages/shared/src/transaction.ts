import { z } from 'zod';
import { accountRefSchema } from './account.js';
import { categorySchema, transactionKindSchema } from './category.js';
import { amountSchema, toKopecks } from './money.js';
import { timeZoneSchema } from './recurring.js';
import { receiptSchema } from './receipt.js';
import { tagSchema, transactionTagsSchema } from './tag.js';

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
  /** By name; a new name makes a new tag. None if left out. */
  tags: transactionTagsSchema.default([]),
  /**
   * The amount in the user's base currency, when the account is in
   * another: what the bank actually charged. Left out, the server converts
   * at the Bank of Russia rate of the day. Ignored on an account in the
   * base currency.
   */
  baseAmount: amountSchema.optional(),
};

/** One category's share of a split income or expense. */
export const transactionSplitInputSchema = z
  .object({
    categoryId: z.uuid('Выберите категорию'),
    amount: amountSchema,
  })
  .meta({ id: 'TransactionSplitInput' });

export const MAX_SPLITS = 20;

/**
 * 123450 -> "1 234,50", for a message about hundredths. No currency sign:
 * the parts are in the account's currency, which the schema does not know.
 */
const hundredths = (kopecks: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2 }).format(
    kopecks / 100,
  );

/** An income or expense as sent, before its fields are known to be valid. */
interface LooseCategorizedInput {
  categoryId?: unknown;
  splits?: unknown;
  amount?: unknown;
}

/**
 * A category or parts, not both; one part per category; parts adding up
 * to the amount. Checks only what is readable: a field that is itself
 * invalid already has its issue.
 */
function checkParts(input: LooseCategorizedInput, ctx: z.RefinementCtx) {
  if (!Array.isArray(input.splits)) {
    if (input.splits === undefined && !input.categoryId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Выберите категорию',
        path: ['categoryId'],
      });
    }
    return;
  }
  if (input.categoryId) {
    ctx.addIssue({
      code: 'custom',
      message: 'Категория задаётся частям, не всей операции',
      path: ['categoryId'],
    });
  }

  const splits = input.splits as { categoryId?: unknown; amount?: unknown }[];
  const seen = new Set<unknown>();
  splits.forEach((split, index) => {
    if (!split?.categoryId) return;
    if (seen.has(split.categoryId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Эта категория уже есть в другой части',
        path: ['splits', index, 'categoryId'],
      });
    }
    seen.add(split.categoryId);
  });

  // Kopecks: exact, unlike adding up the strings as floats. Skipped while
  // an amount is not a positive number: its own issue says enough.
  const kopecks = (amount: unknown) =>
    typeof amount === 'string' ? toKopecks(amount) : Number.NaN;
  const total = kopecks(input.amount);
  const parts = splits.map((split) => kopecks(split?.amount));
  if (![total, ...parts].every((value) => value > 0)) return;
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum === total) return;
  ctx.addIssue({
    code: 'custom',
    message:
      sum < total
        ? `Части меньше суммы операции на ${hundredths(total - sum)}`
        : `Части больше суммы операции на ${hundredths(sum - total)}`,
    path: ['splits'],
  });
}

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
        /** One category; or, for a split transaction, `splits` instead. */
        categoryId: z.uuid('Выберите категорию').optional(),
        /**
         * The parts of a split transaction: at least two, one per category,
         * all of the transaction's kind, adding up to its amount.
         */
        splits: z
          .array(transactionSplitInputSchema)
          .min(2, 'Разделите хотя бы на две части')
          .max(MAX_SPLITS, `Не больше ${MAX_SPLITS} частей`)
          .optional(),
        ...inputFields,
      })
      // Also when other fields are invalid (`when`): an empty form should
      // say "choose a category" together with everything else, not after.
      // The value may be invalid then, hence the loose type.
      .superRefine(
        (input: LooseCategorizedInput, ctx) => checkParts(input, ctx),
        {
          when: ({ value }) => typeof value === 'object' && value !== null,
        },
      )
      .meta({ id: 'CategorizedTransactionInput' }),
    z
      .object({
        type: z.literal('transfer'),
        toAccountId: z.uuid('Выберите счёт'),
        /**
         * What reached the other account, in its currency. Required when
         * the two accounts are in different currencies; ignored otherwise
         * (the same amount arrives).
         */
        toAmount: amountSchema.optional(),
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
  /**
   * In the currency of `account`: always positive, with 2 fraction digits,
   * e.g. "1234.50".
   */
  amount: z.string(),
  /**
   * In the user's base currency: what totals and budgets count. The same
   * as `amount` on an account in the base currency; otherwise converted at
   * the Bank of Russia rate of the day, or given by hand.
   */
  baseAmount: z.string(),
  /** `baseAmount` was given by hand rather than converted. */
  baseAmountManual: z.boolean(),
  comment: z.string().nullable(),
  // coerce: in JSON a date is a string; the same schema must also
  // parse a response on the client.
  occurredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  /** For a transfer: the account the money left. */
  account: accountRefSchema,
  /** Made by this recurring rule; null for one entered by hand. */
  recurringRuleId: z.uuid().nullable(),
  /** By name. */
  tags: z.array(tagSchema),
  /** Photos of receipts, in the order they were added. */
  receipts: z.array(receiptSchema),
};

export const transactionSplitSchema = z
  .object({
    category: categorySchema,
    /** With 2 fraction digits, e.g. "1234.50". */
    amount: z.string(),
  })
  .meta({ id: 'TransactionSplit' });

export const transactionSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: transactionKindSchema,
        ...outputFields,
        /** null for a split transaction: its categories are in `splits`. */
        category: categorySchema.nullable(),
        /** The parts of a split transaction, largest first; empty if not split. */
        splits: z.array(transactionSplitSchema),
      })
      .meta({ id: 'CategorizedTransaction' }),
    z
      .object({
        type: z.literal('transfer'),
        ...outputFields,
        toAccount: accountRefSchema,
        /** What reached `toAccount`, in its currency. */
        toAmount: z.string(),
      })
      .meta({ id: 'Transfer' }),
  ])
  .meta({ id: 'Transaction' });

const transactionFilters = {
  /** Inclusive. */
  from: z.coerce.date().optional(),
  /** Exclusive. */
  to: z.coerce.date().optional(),
  /** A split transaction counts if one of its parts is in the category. */
  categoryId: z.uuid().optional(),
  /** Money that left or reached the account: transfers count for both. */
  accountId: z.uuid().optional(),
  type: transactionTypeSchema.optional(),
  /** Transactions with this tag. */
  tagId: z.uuid().optional(),
  /**
   * A piece of the comment, anywhere in it: "такс" finds "Яндекс Такси".
   * Case and ё/е do not matter.
   */
  q: z
    .string()
    .trim()
    .min(2, 'Введите хотя бы 2 символа')
    .max(100, 'Не длиннее 100 символов')
    .optional(),
};

export const listTransactionsQuerySchema = z.object({
  /** Opaque, from `nextCursor` of the previous page. */
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  ...transactionFilters,
});

/**
 * The same filters as the feed, no paging: the export is everything that
 * matches. The time zone is the client's, so the dates in the file read as
 * the user saw them on screen.
 */
export const exportTransactionsQuerySchema = z.object({
  ...transactionFilters,
  timeZone: timeZoneSchema,
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
  /** Only transactions with this tag: what a trip cost. */
  tagId: z.uuid().optional(),
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
  /** Only transactions with this tag. */
  tagId: z.uuid().optional(),
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

export const tagTotalsQuerySchema = categoryTotalsQuerySchema.omit({
  tagId: true,
});

/**
 * A transaction with two tags counts in both: tag totals overlap and do
 * not add up to the total of the period.
 */
export const tagTotalSchema = z
  .object({
    tag: tagSchema,
    /** Sum over the period, always with 2 fraction digits. */
    total: z.string(),
  })
  .meta({ id: 'TagTotal' });

export const tagTotalsSchema = z
  .array(tagTotalSchema)
  .meta({ id: 'TagTotals' });

export type TransactionType = z.infer<typeof transactionTypeSchema>;
export type TransactionSplitInput = z.infer<typeof transactionSplitInputSchema>;
export type TransactionSplit = z.infer<typeof transactionSplitSchema>;
export type TransactionInputDto = z.infer<typeof transactionInputSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type ExportTransactionsQuery = z.infer<
  typeof exportTransactionsQuerySchema
>;
export type TransactionPage = z.infer<typeof transactionPageSchema>;
export type TransactionSummaryQuery = z.infer<
  typeof transactionSummaryQuerySchema
>;
export type TransactionSummary = z.infer<typeof transactionSummarySchema>;
export type CategoryTotalsQuery = z.infer<typeof categoryTotalsQuerySchema>;
export type CategoryTotal = z.infer<typeof categoryTotalSchema>;
export type TagTotalsQuery = z.infer<typeof tagTotalsQuerySchema>;
export type TagTotal = z.infer<typeof tagTotalSchema>;
