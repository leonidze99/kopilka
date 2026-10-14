import { z } from 'zod';

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
export type RenameTagDto = z.infer<typeof renameTagSchema>;
