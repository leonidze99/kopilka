import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Category,
  type Import,
  type ImportCategoryGroup,
  type ImportColumns,
  type ImportCommitDto,
  type ImportMappingDto,
  type ImportSummary,
  IMPORT_MAX_COLUMNS,
  importColumnsSchema,
  type PossibleDuplicate,
  type TransactionKind,
} from '@kopilka/shared';
import type { Request } from 'express';
import {
  accountRefSelect,
  AccountsService,
  assertNotArchived,
  toAccountRef,
} from '../accounts/accounts.service.js';
import { categorySelect } from '../categories/categories.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { readCsv, receiveFile } from './csv-upload.js';
import { WHOLE_FILE } from './whole-file.js';
import { ImportWorker } from './import.worker.js';
import { suggestColumns } from './presets.js';

/** Rows per INSERT while uploading: one round trip per this many. */
const UPLOAD_BATCH = 1000;
/** Data rows in a file at most. */
export const MAX_ROWS = 50_000;
const SAMPLE_ROWS = 5;
const SHOWN_ERRORS = 20;

const summarySelect = {
  id: true,
  fileName: true,
  status: true,
  createdAt: true,
  totalRows: true,
  newRows: true,
  duplicateRows: true,
  invalidRows: true,
  skippedRows: true,
  importedRows: true,
  undoneRows: true,
  account: { select: accountRefSelect },
} satisfies Prisma.ImportSelect;

const importSelect = {
  ...summarySelect,
  timeZone: true,
  headers: true,
  preset: true,
  columns: true,
  processed: true,
  error: true,
} satisfies Prisma.ImportSelect;

type SummaryRow = Prisma.ImportGetPayload<{ select: typeof summarySelect }>;

const toSummary = ({
  newRows,
  duplicateRows,
  invalidRows,
  skippedRows,
  importedRows,
  undoneRows,
  ...row
}: SummaryRow): ImportSummary => ({
  ...row,
  account: row.account && toAccountRef(row.account),
  counts: {
    new: newRows,
    duplicate: duplicateRows,
    invalid: invalidRows,
    skipped: skippedRows,
    imported: importedRows,
    undone: undoneRows,
  },
});

const notFound = () =>
  new AppException('NOT_FOUND', 'Import not found', HttpStatus.NOT_FOUND);

const wrongStatus = (status: string) =>
  new AppException(
    'CONFLICT',
    `Not possible while the import is ${status}`,
    HttpStatus.CONFLICT,
  );

const invalid = (field: string, message: string, detail: string) =>
  new AppException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST, [
    { field, message: detail },
  ]);

/** The bank's category as the API shows it: null for rows without one. */
const sourceOut = (source: string) => (source === '' ? null : source);
const sourceIn = (source: string | null) => (source ?? '').slice(0, 64);

/** Every column the mapping refers to, with the field naming it. */
function columnsUsed(columns: ImportColumns): [string, number][] {
  const { amount } = columns;
  const used: [string, number | null][] = [
    ['columns.date', columns.date],
    ['columns.description', columns.description],
    ['columns.category', columns.category],
    ['columns.status.column', columns.status?.column ?? null],
  ];
  if (amount.type === 'signed')
    used.push(['columns.amount.column', amount.column]);
  else {
    used.push(['columns.amount.income', amount.income]);
    used.push(['columns.amount.expense', amount.expense]);
  }
  return used.filter((entry): entry is [string, number] => entry[1] !== null);
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly worker: ImportWorker,
  ) {}

  /**
   * Streams the file into import_rows a batch at a time. Not in one
   * database transaction: an upload lasts as long as the client's network
   * does, and a transaction would hold a pooled connection all that time
   * (a few slow clients would starve the pool). Instead the import stays
   * "uploading" until the last row is in; a failed upload deletes it, and
   * one cut off by a crash is swept away later.
   */
  async upload(userId: string, req: Request): Promise<Import> {
    const file = await receiveFile(req);
    const { id } = await this.prisma.import.create({
      data: {
        userId,
        fileName: file.name.slice(0, 255),
        status: 'uploading',
        headers: [],
      },
      select: { id: true },
    });

    try {
      let headers: string[] | undefined;
      const sample: string[][] = [];
      let rows = 0;
      let batch: Prisma.ImportRowCreateManyInput[] = [];
      for await (const { cells, line } of readCsv(file.content)) {
        if (!headers) {
          if (cells.length > IMPORT_MAX_COLUMNS) {
            throw invalid(
              'file',
              'Too many columns',
              `Больше ${IMPORT_MAX_COLUMNS} колонок — это не похоже на выписку`,
            );
          }
          headers = cells.map((cell) => cell.trim());
          continue;
        }
        if (++rows > MAX_ROWS) {
          throw invalid(
            'file',
            'Too many rows',
            `Больше ${MAX_ROWS.toLocaleString('ru-RU')} операций — разбейте выписку на части`,
          );
        }
        const kept = cells.slice(0, IMPORT_MAX_COLUMNS);
        if (sample.length < SAMPLE_ROWS) sample.push(kept);
        batch.push({ importId: id, line, cells: kept });
        if (batch.length === UPLOAD_BATCH) {
          await this.prisma.importRow.createMany({ data: batch });
          batch = [];
        }
      }
      if (batch.length > 0)
        await this.prisma.importRow.createMany({ data: batch });
      if (!headers || rows === 0) {
        throw invalid('file', 'No rows in the file', 'В файле нет операций');
      }

      const suggestion = suggestColumns(headers, sample);
      await this.prisma.import.update({
        where: { id },
        data: {
          status: 'uploaded',
          headers,
          totalRows: rows,
          preset: suggestion.preset,
          columns: suggestion.columns ?? Prisma.DbNull,
        },
      });
    } catch (error) {
      file.discard();
      await this.prisma.import.delete({ where: { id } }).catch(() => {});
      throw error;
    }
    return this.get(userId, id);
  }

  async list(userId: string): Promise<ImportSummary[]> {
    const rows = await this.prisma.import.findMany({
      where: { userId, status: { not: 'uploading' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: summarySelect,
    });
    return rows.map(toSummary);
  }

  async get(userId: string, id: string): Promise<Import> {
    const row = await this.prisma.import.findUnique({
      where: { id, userId },
      select: importSelect,
    });
    if (!row) throw notFound();
    const { timeZone, headers, preset, columns, processed, error, ...summary } =
      row;

    const ready = row.status === 'ready';
    const [sample, errors, categories, possibleDuplicates] = await Promise.all([
      this.prisma.importRow.findMany({
        where: { importId: id },
        orderBy: { line: 'asc' },
        take: SAMPLE_ROWS,
        select: { cells: true },
      }),
      this.prisma.importRow.findMany({
        where: { importId: id, status: 'invalid' },
        orderBy: { line: 'asc' },
        take: SHOWN_ERRORS,
        select: { line: true, error: true },
      }),
      ready ? this.categoryGroups(userId, id) : [],
      ready ? this.possibleDuplicates(id) : [],
    ]);

    return {
      ...toSummary(summary),
      timeZone,
      headers,
      preset,
      // Written by this service from a parsed ImportColumns.
      columns: columns === null ? null : importColumnsSchema.parse(columns),
      processed,
      sample: sample.map((r) => r.cells),
      errors: errors.map((r) => ({ line: r.line, message: r.error ?? '' })),
      categories,
      possibleDuplicates,
      error,
    };
  }

  /**
   * Which columns hold what, and the account. Starts (or restarts) the
   * parsing in the background; the rows read before are read again.
   */
  async setMapping(
    userId: string,
    id: string,
    dto: ImportMappingDto,
  ): Promise<Import> {
    await this.prisma.$transaction(async (tx) => {
      // Serializes with a concurrent commit or another mapping of the import.
      const [current] = await tx.$queryRaw<
        { status: string; headers: string[] }[]
      >`
        SELECT status, headers FROM imports
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      if (!current) throw notFound();
      if (!['uploaded', 'ready', 'failed'].includes(current.status)) {
        throw wrongStatus(current.status);
      }
      const outside = columnsUsed(dto.columns).find(
        ([, column]) => column >= current.headers.length,
      );
      if (outside) {
        throw invalid(
          outside[0],
          'No such column',
          'В файле нет такой колонки',
        );
      }
      const account = await tx.account.findUnique({
        where: { id_userId: { id: dto.accountId, userId } },
        select: { id: true, archivedAt: true },
      });
      if (!account)
        throw invalid('accountId', 'Account not found', 'Счёт не найден');
      assertNotArchived(new Set(account.archivedAt ? [account.id] : []), [
        { id: account.id, field: 'accountId' },
      ]);

      await tx.importRow.updateMany({
        where: { importId: id, status: { not: null } },
        data: {
          status: null,
          localAt: null,
          occurredAt: null,
          amount: null,
          kind: null,
          description: null,
          sourceCategory: null,
          categoryId: null,
          fingerprint: null,
          error: null,
          similarTransactionId: null,
        },
      });
      await tx.import.update({
        where: { id },
        data: {
          accountId: dto.accountId,
          timeZone: dto.timeZone,
          columns: dto.columns,
          status: 'parsing',
          processed: 0,
          newRows: 0,
          duplicateRows: 0,
          invalidRows: 0,
          skippedRows: 0,
          importedRows: 0,
          error: null,
          lockedUntil: null,
          attempts: 0,
        },
      });
    }, WHOLE_FILE);
    this.worker.kick();
    return this.get(userId, id);
  }

  /**
   * The categories for the new rows, and the go-ahead: the worker creates
   * the transactions in the background. The choices are remembered for the
   * next import.
   */
  async commit(
    userId: string,
    id: string,
    dto: ImportCommitDto,
  ): Promise<Import> {
    await this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<
        { status: string; account_id: string; currency: string | null }[]
      >`
        SELECT i.status, i.account_id, a.currency
        FROM imports i
        -- No account before the columns are mapped.
        LEFT JOIN accounts a ON a.id = i.account_id
        WHERE i.id = ${id}::uuid AND i.user_id = ${userId}::uuid
        FOR UPDATE OF i
      `;
      if (!current) throw notFound();
      if (current.status !== 'ready') throw wrongStatus(current.status);

      // Possible duplicates the user leaves out, first: they need no
      // category and do not count in the balance check. In this transaction,
      // so a refused commit skips nothing.
      if (dto.skipLines.length > 0) {
        const { count } = await tx.importRow.updateMany({
          where: { importId: id, status: 'new', line: { in: dto.skipLines } },
          data: { status: 'skipped', error: 'Уже есть на счёте' },
        });
        await tx.import.update({
          where: { id },
          data: {
            newRows: { decrement: count },
            skippedRows: { increment: count },
          },
        });
      }

      const groups = await tx.$queryRaw<
        { kind: TransactionKind; source: string; net: Prisma.Decimal }[]
      >`
        SELECT kind, source_category AS source,
               SUM(CASE WHEN kind = 'income' THEN amount ELSE -amount END) AS net
        FROM import_rows
        WHERE import_id = ${id}::uuid AND status = 'new'
        GROUP BY kind, source_category
      `;
      const choices = groups.map((group) => {
        const index = dto.categories.findIndex(
          (choice) =>
            choice.kind === group.kind &&
            sourceIn(choice.source) === group.source,
        );
        const target = dto.categories[index];
        if (!target) {
          throw invalid(
            'categories',
            'A group has no target',
            `Выберите категорию для «${group.source || 'Без категории'}»`,
          );
        }
        return { ...group, index, target };
      });

      const categoryChoices = choices.filter(
        (choice) => choice.target.target === 'category',
      );
      const transferChoices = choices.filter(
        (choice) => choice.target.target === 'transfer',
      );

      const [categories, targetAccounts] = await Promise.all([
        tx.category.findMany({
          where: {
            userId,
            id: {
              in: categoryChoices.map((c) =>
                c.target.target === 'category' ? c.target.categoryId : '',
              ),
            },
          },
          select: { id: true, kind: true },
        }),
        tx.account.findMany({
          where: {
            userId,
            id: {
              in: transferChoices.map((c) =>
                c.target.target === 'transfer' ? c.target.toAccountId : '',
              ),
            },
          },
          select: { id: true, currency: true, archivedAt: true },
        }),
      ]);

      for (const choice of choices) {
        if (choice.target.target === 'transfer') {
          const field = `categories.${choice.index}.toAccountId`;
          const { toAccountId } = choice.target;
          const target = targetAccounts.find(
            (account) => account.id === toAccountId,
          );
          if (!target) {
            throw invalid(field, 'Account not found', 'Счёт не найден');
          }
          assertNotArchived(new Set(target.archivedAt ? [target.id] : []), [
            { id: target.id, field },
          ]);
          // The statement has one amount; what arrived in another currency
          // is not in it.
          if (target.currency !== current.currency) {
            throw invalid(
              field,
              'Transfer to an account in another currency',
              'Перевод из выписки — только на счёт в той же валюте',
            );
          }
          // A transfer has two sides; both being the same account is what
          // the database refuses anyway (to_account_id <> account_id).
          if (toAccountId === current.account_id) {
            throw invalid(
              field,
              'Transfer to the account being imported into',
              'Это тот же счёт, на который идёт импорт',
            );
          }
          continue;
        }
        const field = `categories.${choice.index}.categoryId`;
        const category = categories.find(
          (c) =>
            choice.target.target === 'category' &&
            c.id === choice.target.categoryId,
        );
        if (!category) {
          throw invalid(field, 'Category not found', 'Категория не найдена');
        }
        if (category.kind !== choice.kind) {
          throw invalid(
            field,
            'Category of another kind',
            choice.kind === 'income'
              ? 'Это категория расходов'
              : 'Это категория доходов',
          );
        }
      }

      // What the import does to each account: every row moves the one being
      // imported into, and a transfer group moves the account at the other
      // end by the same amount the other way.
      const deltas = new Map<string, Prisma.Decimal>();
      const move = (accountId: string, amount: Prisma.Decimal) =>
        deltas.set(
          accountId,
          (deltas.get(accountId) ?? new Prisma.Decimal(0)).plus(amount),
        );
      for (const choice of choices) {
        const net = new Prisma.Decimal(choice.net);
        move(current.account_id, net);
        if (choice.target.target === 'transfer') {
          move(choice.target.toAccountId, net.negated());
        }
      }

      // Early answer for the common case; the worker checks again under the
      // account locks, against the balances at that moment.
      for (const [accountId, delta] of deltas) {
        const shortfall = await this.accounts.shortfall(
          tx,
          userId,
          accountId,
          delta.negated(),
        );
        if (shortfall) {
          throw new AppException(
            'INSUFFICIENT_FUNDS',
            'Account must not go negative',
            HttpStatus.CONFLICT,
            [
              {
                field: 'categories',
                message: `После импорта на счёте «${shortfall.account}» не хватит ${shortfall.missing}`,
              },
            ],
          );
        }
      }

      if (categoryChoices.length > 0) {
        await tx.$executeRaw`
          UPDATE import_rows r SET category_id = v.category_id
          FROM unnest(
            ${categoryChoices.map((c) => c.kind)}::transaction_kind[],
            ${categoryChoices.map((c) => c.source)}::text[],
            ${categoryChoices.map((c) =>
              c.target.target === 'category' ? c.target.categoryId : null,
            )}::uuid[]
          ) AS v(kind, source, category_id)
          WHERE r.import_id = ${id}::uuid AND r.status = 'new'
            AND r.kind = v.kind AND r.source_category = v.source
        `;
      }
      if (transferChoices.length > 0) {
        await tx.$executeRaw`
          UPDATE import_rows r SET to_account_id = v.to_account_id
          FROM unnest(
            ${transferChoices.map((c) => c.kind)}::transaction_kind[],
            ${transferChoices.map((c) => c.source)}::text[],
            ${transferChoices.map((c) =>
              c.target.target === 'transfer' ? c.target.toAccountId : null,
            )}::uuid[]
          ) AS v(kind, source, to_account_id)
          WHERE r.import_id = ${id}::uuid AND r.status = 'new'
            AND r.kind = v.kind AND r.source_category = v.source
        `;
      }
      for (const choice of choices) {
        // Exactly one of the two, as the CHECK on the table requires.
        const target =
          choice.target.target === 'category'
            ? { categoryId: choice.target.categoryId, toAccountId: null }
            : { categoryId: null, toAccountId: choice.target.toAccountId };
        await tx.importCategoryRule.upsert({
          where: {
            userId_kind_source: {
              userId,
              kind: choice.kind,
              source: choice.source,
            },
          },
          create: {
            userId,
            kind: choice.kind,
            source: choice.source,
            ...target,
          },
          update: target,
        });
      }
      await tx.import.update({
        where: { id },
        data: {
          status: 'importing',
          processed: 0,
          error: null,
          lockedUntil: null,
          attempts: 0,
        },
      });
    }, WHOLE_FILE);
    this.worker.kick();
    return this.get(userId, id);
  }

  /**
   * Deletes the transactions of a finished import, edited ones included
   * (a category fixed after the import is the usual edit). One write, as
   * deleting by hand: an income gone may take an account that must not go
   * negative below zero, and then nothing is deleted.
   *
   * Locks as every other write does, the transaction rows first and the
   * accounts after: an edit of one of these transactions running at the
   * same time waits instead of deadlocking.
   */
  async undo(userId: string, id: string): Promise<Import> {
    await this.prisma.$transaction(async (tx) => {
      const [current] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM imports
        WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      if (!current) throw notFound();
      if (current.status !== 'done') throw wrongStatus(current.status);

      // The accounts as they are now: an imported expense may have been
      // moved to another account or turned into a transfer since.
      const rows = await tx.$queryRaw<
        { account_id: string; to_account_id: string | null }[]
      >`
        SELECT account_id, to_account_id FROM transactions
        WHERE import_id = ${id}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      const accounts = [
        ...new Set(rows.flatMap((r) => [r.account_id, r.to_account_id])),
      ].filter((account): account is string => account !== null);
      await this.accounts.lock(
        tx,
        userId,
        accounts.map((account) => ({ id: account, field: 'id' })),
        () => new Error(`Accounts of import ${id} are gone`),
      );

      const { count } = await tx.transaction.deleteMany({
        where: { importId: id, userId },
      });
      await this.accounts.assertNotNegative(tx, userId, accounts, 'id');
      await tx.import.update({
        where: { id },
        data: { status: 'undone', undoneRows: count },
      });
    }, WHOLE_FILE);
    return this.get(userId, id);
  }

  /**
   * Drops an import from the history: one that made no transactions, or
   * whose transactions were undone. One in progress is left to finish; a
   * finished one is undone first.
   */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.import.deleteMany({
      where: { id, userId, status: { notIn: ['importing', 'done'] } },
    });
    if (count > 0) return;
    const existing = await this.prisma.import.findUnique({
      where: { id, userId },
      select: { status: true },
    });
    if (!existing) throw notFound();
    throw wrongStatus(existing.status);
  }

  /** The rows the worker paired with a similar transaction, in file order. */
  private async possibleDuplicates(id: string): Promise<PossibleDuplicate[]> {
    const rows = await this.prisma.$queryRaw<
      {
        line: number;
        kind: TransactionKind;
        amount: Prisma.Decimal;
        occurred_at: Date;
        description: string | null;
        source: string;
        similar_id: string;
        similar_at: Date;
        similar_comment: string | null;
        similar_label: string;
      }[]
    >`
      SELECT r.line, r.kind, r.amount, r.occurred_at, r.description,
             r.source_category AS source,
             t.id AS similar_id, t.occurred_at AS similar_at,
             t.comment AS similar_comment,
             COALESCE(c.name, 'Перевод') AS similar_label
      FROM import_rows r
      JOIN transactions t ON t.id = r.similar_transaction_id
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE r.import_id = ${id}::uuid AND r.status = 'new'
      ORDER BY r.line
      LIMIT 200
    `;
    return rows.map((row) => ({
      line: row.line,
      kind: row.kind,
      amount: new Prisma.Decimal(row.amount).toFixed(2),
      occurredAt: row.occurred_at,
      description: row.description,
      source: sourceOut(row.source),
      similar: {
        id: row.similar_id,
        occurredAt: row.similar_at,
        comment: row.similar_comment,
        label: row.similar_label,
      },
    }));
  }

  /**
   * The new rows by kind and bank category, each with a suggested category:
   * the one chosen on a previous import, else the user's category with the
   * same name. Matched in JS: lower() in Postgres folds Cyrillic only under
   * a UTF-8 locale, and the database may be created with another.
   */
  private async categoryGroups(
    userId: string,
    id: string,
  ): Promise<ImportCategoryGroup[]> {
    const [groups, rules, categories] = await Promise.all([
      this.prisma.$queryRaw<
        {
          kind: TransactionKind;
          source: string;
          rows: number;
          total: Prisma.Decimal;
        }[]
      >`
        SELECT kind, source_category AS source, COUNT(*)::int AS rows,
               SUM(amount) AS total
        FROM import_rows
        WHERE import_id = ${id}::uuid AND status = 'new'
        GROUP BY kind, source_category
        ORDER BY rows DESC, kind, source_category
      `,
      this.prisma.importCategoryRule.findMany({
        where: { userId },
        select: {
          kind: true,
          source: true,
          categoryId: true,
          toAccount: { select: accountRefSelect },
        },
      }),
      this.prisma.category.findMany({
        where: { userId },
        select: categorySelect,
      }),
    ]);

    const byId = new Map(categories.map((c) => [c.id, c]));
    const suggest = (
      kind: TransactionKind,
      source: string,
    ): Pick<ImportCategoryGroup, 'category' | 'toAccount'> => {
      const rule = rules.find((r) => r.kind === kind && r.source === source);
      // A rule remembers one of the two: a category, or "these are
      // transfers to that account".
      if (rule?.toAccount) {
        return { category: null, toAccount: toAccountRef(rule.toAccount) };
      }
      const remembered = rule?.categoryId && byId.get(rule.categoryId);
      if (remembered) return { category: remembered, toAccount: null };
      const name = source.toLowerCase();
      return {
        category:
          categories.find(
            (c) => c.kind === kind && c.name.toLowerCase() === name,
          ) ?? null,
        toAccount: null,
      };
    };

    return groups.map((group) => ({
      kind: group.kind,
      source: sourceOut(group.source),
      rows: group.rows,
      total: new Prisma.Decimal(group.total).toFixed(2),
      ...suggest(group.kind, group.source),
    }));
  }
}
