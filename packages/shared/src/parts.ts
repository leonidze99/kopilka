import { z } from 'zod';
import { categorySchema } from './category.js';
import { amountSchema, toKopecks } from './money.js';

/**
 * The parts of a split income or expense — of a transaction or of a
 * recurring rule: one category's share each, adding up to the amount.
 */
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
export interface LooseCategorizedInput {
  categoryId?: unknown;
  splits?: unknown;
  amount?: unknown;
}

/**
 * A category or parts, not both; one part per category; parts adding up
 * to the amount. Checks only what is readable: a field that is itself
 * invalid already has its issue.
 */
export function checkParts(input: LooseCategorizedInput, ctx: z.RefinementCtx) {
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

/** `splits` of an input: at least two parts, at most MAX_SPLITS. */
export const splitsInputSchema = z
  .array(transactionSplitInputSchema)
  .min(2, 'Разделите хотя бы на две части')
  .max(MAX_SPLITS, `Не больше ${MAX_SPLITS} частей`);
export type TransactionSplitInput = z.infer<typeof transactionSplitInputSchema>;

/** A part as the API shows it, largest first. */
export const transactionSplitSchema = z
  .object({
    category: categorySchema,
    /** With 2 fraction digits, e.g. "1234.50". */
    amount: z.string(),
  })
  .meta({ id: 'TransactionSplit' });

export type TransactionSplit = z.infer<typeof transactionSplitSchema>;
