import { z } from 'zod';
import { amountSchema } from './money.js';

/**
 * A tag as typed on a transaction. Case and ё/е do not tell tags apart:
 * "отпуск" finds the tag "Отпуск" (the database compares a folded key).
 */
export const tagNameSchema = z
  .string()
  .trim()
  .min(1, 'Введите название тега')
  .max(32, 'Тег не длиннее 32 символов');

export const tagSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
  })
  .meta({ id: 'Tag' });

/**
 * A tag in the user's list, with its budget: a limit on what the tag may
 * cost over all time ("Отпуск" — 150 000 ₽), not per month: a tag is a
 * project across categories and months.
 */
export const tagDetailsSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    /**
     * Null: no limit. Spent: the expenses with the tag, ever. Decimal
     * strings; remaining may be negative.
     */
    budget: z
      .object({
        limit: z.string(),
        spent: z.string(),
        remaining: z.string(),
      })
      .nullable(),
  })
  .meta({ id: 'TagDetails' });

/** `amount: null` takes the limit off. */
export const setTagBudgetSchema = z
  .object({ amount: amountSchema.nullable() })
  .meta({ id: 'SetTagBudgetRequest' });

/** The form behind PUT /tags/:id/budget: a limit to set. */
export const tagBudgetFormSchema = z.object({ amount: amountSchema });

export const renameTagSchema = z
  .object({ name: tagNameSchema })
  .meta({ id: 'RenameTagRequest' });

export const MAX_TAGS = 10;

/**
 * The tags of a transaction, by name: a new name makes a new tag. A name
 * twice (in any case) is one tag.
 */
export const transactionTagsSchema = z
  .array(tagNameSchema)
  .max(MAX_TAGS, `Не больше ${MAX_TAGS} тегов`);

export type Tag = z.infer<typeof tagSchema>;
export type TagDetails = z.infer<typeof tagDetailsSchema>;
export type SetTagBudgetDto = z.infer<typeof setTagBudgetSchema>;
export type RenameTagDto = z.infer<typeof renameTagSchema>;
