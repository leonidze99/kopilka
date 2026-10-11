import { z } from 'zod';
import { categorySchema, transactionKindSchema } from './category.js';

/**
 * Money travels as a decimal string ("1234.56"), never as a JS number:
 * binary floats cannot represent most decimal fractions exactly
 * (0.1 + 0.2 !== 0.3). Up to 12 integer digits: fits numeric(14,2).
 */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

/**
 * Accepts what people type: "1 234,5" is read as "1234.5". `\s` also
 * matches the non-breaking space that number formatting inserts.
 */
export const amountSchema = z
  .string()
  .meta({
    description:
      'Positive decimal with up to 2 fraction digits, e.g. "1234.56"',
    example: '1234.56',
  })
  .transform((value) => value.replace(/\s/g, '').replace(',', '.'))
  .pipe(
    z
      .string()
      .regex(AMOUNT_PATTERN, {
        message: 'Сумма — число, не больше двух знаков после запятой',
        // Not a number at all: the "greater than zero" check would only add noise.
        abort: true,
      })
      .refine((value) => Number(value) > 0, 'Сумма должна быть больше нуля'),
  );

const transactionFields = {
  categoryId: z.uuid('Выберите категорию'),
  amount: amountSchema,
  // Dates come over JSON as strings.
  occurredAt: z.coerce.date('Укажите дату'),
  comment: z
    .string()
    .trim()
    .max(280, 'Комментарий не длиннее 280 символов')
    .optional(),
};

export const createTransactionSchema = z
  .object(transactionFields)
  .meta({ id: 'CreateTransactionRequest' });

export const updateTransactionSchema = z
  .object(transactionFields)
  .partial()
  .meta({ id: 'UpdateTransactionRequest' });

export const transactionSchema = z
  .object({
    id: z.uuid(),
    /** Always with 2 fraction digits, e.g. "1234.50". */
    amount: z.string(),
    comment: z.string().nullable(),
    // coerce: in JSON a date is a string; the same schema must also
    // parse a response on the client.
    occurredAt: z.coerce.date(),
    createdAt: z.coerce.date(),
    category: categorySchema,
  })
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
  kind: transactionKindSchema.optional(),
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

export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionDto = z.infer<typeof updateTransactionSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type TransactionPage = z.infer<typeof transactionPageSchema>;
export type TransactionSummaryQuery = z.infer<
  typeof transactionSummaryQuerySchema
>;
export type TransactionSummary = z.infer<typeof transactionSummarySchema>;
