import { z } from 'zod';

export const transactionKindSchema = z.enum(['income', 'expense']);

export const createTransactionSchema = z.object({
  amount: z.number().positive('Сумма должна быть больше нуля'),
  kind: transactionKindSchema,
  categoryId: z.uuid(),
  comment: z.string().max(280).optional(),
  occurredAt: z.coerce.date(),
});

export const transactionSchema = createTransactionSchema.extend({
  id: z.uuid(),
  createdAt: z.coerce.date(),
});

export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
