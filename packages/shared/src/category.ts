import { z } from 'zod';

/** Money flow of a category; a transaction takes it from its category. */
export const transactionKindSchema = z
  .enum(['income', 'expense'])
  .meta({ id: 'TransactionKind' });

const categoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Введите название')
  .max(64, 'Название не длиннее 64 символов');

export const categorySchema = z
  .object({
    id: z.uuid(),
    kind: transactionKindSchema,
    name: z.string(),
  })
  .meta({ id: 'Category' });

export const createCategorySchema = z
  .object({
    kind: transactionKindSchema,
    name: categoryNameSchema,
  })
  .meta({ id: 'CreateCategoryRequest' });

// The kind is fixed: changing it would silently turn existing expenses
// into income.
export const updateCategorySchema = z
  .object({ name: categoryNameSchema })
  .meta({ id: 'UpdateCategoryRequest' });

export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type Category = z.infer<typeof categorySchema>;
export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
