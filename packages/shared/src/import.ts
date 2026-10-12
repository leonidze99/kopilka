import { z } from 'zod';
import { accountRefSchema } from './account.js';
import { categorySchema, transactionKindSchema } from './category.js';
import { timeZoneSchema } from './recurring.js';

/** Columns in a statement at most: more is not a bank statement. */
export const IMPORT_MAX_COLUMNS = 50;

/**
 * uploaded → (columns chosen) → parsing → ready → (categories chosen) →
 * importing → done. A failed import can be given other columns again.
 */
export const importStatusSchema = z
  .enum([
    'uploading',
    'uploaded',
    'parsing',
    'ready',
    'importing',
    'done',
    'failed',
    // The transactions deleted again; the file may be imported anew.
    'undone',
  ])
  .meta({ id: 'ImportStatus' });

/** A column of the file, counted from 0. */
const columnSchema = z
  .int('Выберите колонку')
  .min(0, 'Выберите колонку')
  .max(IMPORT_MAX_COLUMNS - 1, 'Выберите колонку');

/** The order of day, month and year in the date column. */
export const importDateOrderSchema = z
  .enum(['dmy', 'ymd', 'mdy'])
  .meta({ id: 'ImportDateOrder' });

/** Which column of the statement holds what. */
export const importColumnsSchema = z
  .object({
    date: columnSchema,
    dateOrder: importDateOrderSchema,
    amount: z.discriminatedUnion('type', [
      /** One column: negative is an expense, positive an income. */
      z.object({ type: z.literal('signed'), column: columnSchema }),
      /** Two columns: money in, money out (either may be empty). */
      z.object({
        type: z.literal('split'),
        income: columnSchema,
        expense: columnSchema,
      }),
    ]),
    /** Becomes the comment of the transaction. */
    description: columnSchema.nullable(),
    /** The bank's category, mapped to the user's categories on commit. */
    category: columnSchema.nullable(),
    /** Only rows with this value in the column are imported (e.g. "OK"). */
    status: z
      .object({
        column: columnSchema,
        value: z.string().trim().min(1, 'Введите значение'),
      })
      .nullable(),
  })
  .meta({ id: 'ImportColumns' });

export const importMappingSchema = z
  .object({
    accountId: z.uuid('Выберите счёт'),
    /** The zone of the statement's times: they are local. */
    timeZone: timeZoneSchema,
    columns: importColumnsSchema,
  })
  .meta({ id: 'ImportMappingRequest' });

export const importCommitSchema = z
  .object({
    /** A category for every group in `Import.categories`. */
    categories: z.array(
      z.object({
        kind: transactionKindSchema,
        /** The bank's category; null for rows without one. */
        source: z.string().nullable(),
        categoryId: z.uuid('Выберите категорию'),
      }),
    ),
    /** Rows not to import: possible duplicates the user chose to skip. */
    skipLines: z.array(z.int().min(2)).max(50_000).default([]),
  })
  .meta({ id: 'ImportCommitRequest' });

const importCountsSchema = z
  .object({
    /** Become transactions on import. */
    new: z.int(),
    /** Already imported into this account. */
    duplicate: z.int(),
    /** Could not be read; see `errors`. */
    invalid: z.int(),
    /** Not transactions: a declined payment, a zero amount. */
    skipped: z.int(),
    /** Created by the import. */
    imported: z.int(),
    /** Deleted by undoing the import. */
    undone: z.int(),
  })
  .meta({ id: 'ImportCounts' });

/** New rows of one kind with one bank category, and where they will go. */
export const importCategoryGroupSchema = z
  .object({
    kind: transactionKindSchema,
    source: z.string().nullable(),
    rows: z.int(),
    total: z.string(),
    /** Remembered from a previous import or found by name; null: choose. */
    category: categorySchema.nullable(),
  })
  .meta({ id: 'ImportCategoryGroup' });

const importSummaryFields = {
  id: z.uuid(),
  fileName: z.string(),
  status: importStatusSchema,
  createdAt: z.coerce.date(),
  account: accountRefSchema.nullable(),
  totalRows: z.int(),
  counts: importCountsSchema,
};

/**
 * A new row that looks like a transaction already in the account but not
 * imported (entered by hand, or made by a recurring rule): same direction
 * and amount, a day or two apart.
 */
export const possibleDuplicateSchema = z
  .object({
    line: z.int(),
    kind: transactionKindSchema,
    amount: z.string(),
    occurredAt: z.coerce.date(),
    description: z.string().nullable(),
    /** The bank's category; null for rows without one. */
    source: z.string().nullable(),
    similar: z.object({
      id: z.uuid(),
      occurredAt: z.coerce.date(),
      comment: z.string().nullable(),
      /** Its category, or "Перевод" for a transfer. */
      label: z.string(),
    }),
  })
  .meta({ id: 'PossibleDuplicate' });

export const importSummarySchema = z
  .object(importSummaryFields)
  .meta({ id: 'ImportSummary' });

export const importSummaryListSchema = z
  .array(importSummarySchema)
  .meta({ id: 'ImportSummaryList' });

export const importSchema = z
  .object({
    ...importSummaryFields,
    timeZone: z.string().nullable(),
    headers: z.array(z.string()),
    /** The first data rows as uploaded (none once imported). */
    sample: z.array(z.array(z.string())),
    /** The bank format recognised by the headers, e.g. "tbank". */
    preset: z.string().nullable(),
    /** The columns chosen, or as guessed from the headers until then. */
    columns: importColumnsSchema.nullable(),
    /** Rows done in the current phase (parsing or importing). */
    processed: z.int(),
    /** The first rows that could not be read. */
    errors: z.array(z.object({ line: z.int(), message: z.string() })),
    /** While ready: the new rows by kind and bank category. */
    categories: z.array(importCategoryGroupSchema),
    /** While ready: new rows like a transaction already there. */
    possibleDuplicates: z.array(possibleDuplicateSchema),
    /** Why the last attempt failed, for the user. */
    error: z.string().nullable(),
  })
  .meta({ id: 'Import' });

export type ImportStatus = z.infer<typeof importStatusSchema>;
export type ImportDateOrder = z.infer<typeof importDateOrderSchema>;
export type ImportColumns = z.infer<typeof importColumnsSchema>;
export type ImportMappingDto = z.infer<typeof importMappingSchema>;
export type ImportCommitDto = z.infer<typeof importCommitSchema>;
export type ImportCategoryGroup = z.infer<typeof importCategoryGroupSchema>;
export type ImportSummary = z.infer<typeof importSummarySchema>;
export type Import = z.infer<typeof importSchema>;
export type PossibleDuplicate = z.infer<typeof possibleDuplicateSchema>;
