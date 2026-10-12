import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { importColumnsSchema } from '@kopilka/shared';
import { AccountsService, type Tx } from '../accounts/accounts.service.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Env } from '../config/env.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseRow } from './parse-row.js';

interface Job {
  id: string;
  user_id: string;
  account_id: string;
  status: 'parsing' | 'importing';
  columns: unknown;
  time_zone: string;
  attempts: number;
}

/** Rows per round trip, parsing or importing. */
const BATCH = 1000;
/**
 * How long a claimed import is the worker's. Renewed after every batch;
 * a worker that dies stops renewing and another one takes over.
 */
const LEASE = '2 minutes';
/** Claims per phase before giving up on an import that keeps failing. */
const MAX_ATTEMPTS = 3;
/** Unfinished imports nobody came back to are deleted after this. */
const ABANDONED_AFTER = '1 day';

/**
 * Processes imports in the background: parses the staged rows with the
 * chosen columns, then creates the transactions. Postgres is the queue, as
 * for recurring payments, but the jobs are long, so a claim is a lease
 * (locked_until) rather than a row lock held for the whole job: a row lock
 * would need a transaction open just as long, and a crashed worker's
 * lease simply runs out.
 */
@Injectable()
export class ImportWorker {
  private readonly logger = new Logger(ImportWorker.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true });
  }

  /**
   * Starts on new work right away instead of at the next tick. Fire and
   * forget: the request does not wait. If this process dies first, the
   * tick of any instance picks the import up.
   */
  kick(): void {
    if (this.enabled) setImmediate(() => void this.tick());
  }

  @Cron(CronExpression.EVERY_30_SECONDS, { name: 'imports' })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runPending();
    } catch (error) {
      this.logger.error(error, 'Import worker failed');
    }
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'imports-cleanup' })
  async cleanup(): Promise<void> {
    if (!this.enabled) return;
    const deleted = await this.prisma.$executeRaw`
      DELETE FROM imports
      WHERE status IN ('uploading', 'uploaded', 'ready', 'failed')
        AND updated_at < now() - ${ABANDONED_AFTER}::interval
    `;
    if (deleted > 0) this.logger.log({ deleted }, 'Abandoned imports deleted');
  }

  /** Works until no import is waiting. Returns how many jobs it ran. */
  async runPending(): Promise<number> {
    let jobs = 0;
    for (let job = await this.claim(); job; job = await this.claim()) {
      jobs++;
      if (job.attempts > MAX_ATTEMPTS) {
        await this.fail(job.id, 'Не удалось обработать файл');
        continue;
      }
      try {
        if (job.status === 'parsing') await this.parse(job);
        else await this.import(job);
      } catch (error) {
        // The lease runs out and the import is tried again (attempts).
        this.logger.error(error, `Import ${job.id} failed while ${job.status}`);
      }
    }
    return jobs;
  }

  /**
   * The oldest import waiting for a worker, leased. SKIP LOCKED: two
   * workers claiming at once take different imports, neither waits.
   */
  private async claim(): Promise<Job | undefined> {
    const [job] = await this.prisma.$queryRaw<Job[]>`
      UPDATE imports
      SET locked_until = now() + ${LEASE}::interval, attempts = attempts + 1
      WHERE id = (
        SELECT id FROM imports
        WHERE status IN ('parsing', 'importing')
          AND (locked_until IS NULL OR locked_until < now())
        ORDER BY created_at, id
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, account_id, status, columns, time_zone, attempts
    `;
    return job;
  }

  /**
   * Phase 1: rows to values, a batch per short transaction. Resumable: a
   * row is parsed once its status is set, so a worker taking over after a
   * crash continues where the other stopped.
   */
  private async parse(job: Job): Promise<void> {
    const columns = importColumnsSchema.parse(job.columns);
    for (;;) {
      const rows = await this.prisma.importRow.findMany({
        where: { importId: job.id, status: null },
        orderBy: { line: 'asc' },
        take: BATCH,
        select: { line: true, cells: true },
      });
      if (rows.length === 0) break;

      const parsed = rows.map((row) => parseRow(row.cells, columns));
      const pick = <T>(
        get: (row: Extract<(typeof parsed)[number], { status: 'new' }>) => T,
      ) => parsed.map((row) => (row.status === 'new' ? get(row) : null));
      // One UPDATE for the whole batch: arrays in, unnest() turns them into
      // rows to join with. 1000 single-row UPDATEs would be 1000 round trips.
      await this.prisma.$executeRaw`
        UPDATE import_rows r SET
          status = v.status::import_row_status,
          local_at = v.local_at::timestamp,
          occurred_at = v.local_at::timestamp AT TIME ZONE ${job.time_zone},
          amount = v.amount::numeric,
          kind = v.kind::transaction_kind,
          description = v.description,
          source_category = v.source_category,
          fingerprint = v.fingerprint,
          error = v.error
        FROM unnest(
          ${rows.map((row) => row.line)}::int[],
          ${parsed.map((row) => row.status)}::text[],
          ${pick((row) => row.localAt)}::text[],
          ${pick((row) => row.amount)}::text[],
          ${pick((row) => row.kind)}::text[],
          ${pick((row) => row.description)}::text[],
          ${pick((row) => row.sourceCategory)}::text[],
          ${pick((row) => row.fingerprint)}::text[],
          ${parsed.map((row) => (row.status === 'new' ? null : row.error))}::text[]
        ) AS v(line, status, local_at, amount, kind, description,
               source_category, fingerprint, error)
        WHERE r.import_id = ${job.id}::uuid AND r.line = v.line
      `;
      if (!(await this.progress(job.id))) return;
    }
    await this.finishParsing(job);
  }

  /**
   * Fingerprints and duplicates need the whole file, so they come after
   * the last batch, in one transaction with the switch to "ready".
   */
  private async finishParsing(job: Job): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Another worker whose lease ran out may have got here first.
      const [current] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status FROM imports WHERE id = ${job.id}::uuid FOR UPDATE
      `;
      if (current?.status !== 'parsing') return;

      // The n-th identical row of the file (two coffees for 250 on one day)
      // gets n in its fingerprint: a window function numbers the rows within
      // each group of equal base fingerprints, in file order. Importing an
      // overlapping statement later yields the same numbers for the same rows.
      await tx.$executeRaw`
        UPDATE import_rows r
        SET fingerprint = encode(sha256(convert_to(n.fingerprint || '|' || n.occurrence, 'UTF8')), 'hex')
        FROM (
          SELECT line, fingerprint,
                 row_number() OVER (PARTITION BY fingerprint ORDER BY line) AS occurrence
          FROM import_rows
          WHERE import_id = ${job.id}::uuid AND status = 'new'
        ) AS n
        WHERE r.import_id = ${job.id}::uuid AND r.line = n.line
      `;
      // Already in the account: an index lookup per row on
      // (account_id, import_fingerprint).
      await tx.$executeRaw`
        UPDATE import_rows r SET status = 'duplicate'
        FROM transactions t
        WHERE r.import_id = ${job.id}::uuid AND r.status = 'new'
          AND t.account_id = ${job.account_id}::uuid
          AND t.import_fingerprint = r.fingerprint
      `;
      await this.findSimilar(tx, job);
      await tx.$executeRaw`
        UPDATE imports i SET
          status = 'ready',
          processed = i.total_rows,
          new_rows = c.new_rows,
          duplicate_rows = c.duplicate_rows,
          invalid_rows = c.invalid_rows,
          skipped_rows = c.skipped_rows,
          locked_until = NULL,
          attempts = 0,
          updated_at = now()
        FROM (
          SELECT COUNT(*) FILTER (WHERE status = 'new')::int AS new_rows,
                 COUNT(*) FILTER (WHERE status = 'duplicate')::int AS duplicate_rows,
                 COUNT(*) FILTER (WHERE status = 'invalid')::int AS invalid_rows,
                 COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped_rows
          FROM import_rows WHERE import_id = ${job.id}::uuid
        ) AS c
        WHERE i.id = ${job.id}::uuid
      `;
    });
  }

  /**
   * Possible duplicates: a new row and a transaction of the account that
   * was not imported (entered by hand, or made by a recurring rule) with
   * the same direction and amount, at most two days apart (a purchase
   * entered the evening it happened, posted by the bank the next day).
   * Fingerprints cannot find these: a hand-entered one has none.
   *
   * Each transaction explains at most one row: two coffees in the file and
   * one entered by hand are one duplicate, not two. Pairs are kept when
   * each is the other's nearest (window functions rank candidates both
   * ways): an approximation of a one-to-one matching, cheap and right in
   * the usual case of a few candidates.
   *
   * Direction relative to the account: an income, or a transfer into it,
   * is money in; an expense, or a transfer out, money out.
   */
  private findSimilar(tx: Tx, job: Job): Promise<number> {
    return tx.$executeRaw`
      WITH candidates AS (
        SELECT r.line, t.id AS transaction_id,
               abs(extract(epoch FROM t.occurred_at - r.occurred_at)) AS distance
        FROM import_rows r
        JOIN transactions t
          ON (t.account_id = ${job.account_id}::uuid OR t.to_account_id = ${job.account_id}::uuid)
         AND t.import_fingerprint IS NULL
         AND t.amount = r.amount
         AND t.occurred_at BETWEEN r.occurred_at - interval '2 days'
                               AND r.occurred_at + interval '2 days'
        LEFT JOIN categories c ON c.id = t.category_id
        WHERE r.import_id = ${job.id}::uuid AND r.status = 'new'
          AND r.kind = CASE
                WHEN t.to_account_id = ${job.account_id}::uuid THEN 'income'
                WHEN c.kind = 'income' THEN 'income'
                ELSE 'expense'
              END::transaction_kind
      ),
      ranked AS (
        SELECT line, transaction_id,
               row_number() OVER (PARTITION BY line ORDER BY distance, transaction_id) AS for_row,
               row_number() OVER (PARTITION BY transaction_id ORDER BY distance, line) AS for_transaction
        FROM candidates
      )
      UPDATE import_rows r SET similar_transaction_id = ranked.transaction_id
      FROM ranked
      WHERE r.import_id = ${job.id}::uuid AND r.line = ranked.line
        AND ranked.for_row = 1 AND ranked.for_transaction = 1
    `;
  }

  /**
   * Phase 2: the transactions, all in one database transaction. The rule
   * "this account must not go negative" is about the balance after a
   * write, and the import is one write: a statement may dip below zero on
   * the way and end above it. So it is all or nothing, checked at the end;
   * batches committed one by one would leave half an import behind a
   * failed check.
   *
   * Progress still shows: it is written outside the transaction, through
   * another connection, and is visible at once. Inserting a transaction
   * that references the import takes FOR KEY SHARE on the imports row;
   * updating its counters takes FOR NO KEY UPDATE (no key column changes),
   * and the two do not conflict, so the progress update does not wait for
   * the import's own transaction.
   *
   * The account stays locked meanwhile: a manual expense on it waits for
   * the import (seconds even for a large file).
   */
  private async import(job: Job): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await this.accounts.lock(
            tx,
            job.user_id,
            [{ id: job.account_id, field: 'accountId' }],
            () => new Error(`Account of import ${job.id} is gone`),
          );
          // Under the account lock: a worker whose lease ran out and that
          // got here second finds the import done and leaves.
          const current = await tx.import.findUnique({
            where: { id: job.id },
            select: { status: true },
          });
          if (current?.status !== 'importing') return;

          let imported = 0;
          let done = 0;
          for (;;) {
            const rows = await tx.importRow.findMany({
              where: { importId: job.id, status: 'new' },
              orderBy: { line: 'asc' },
              take: BATCH,
              select: {
                line: true,
                occurredAt: true,
                amount: true,
                description: true,
                categoryId: true,
                fingerprint: true,
              },
            });
            if (rows.length === 0) break;

            // ON CONFLICT DO NOTHING on (account_id, import_fingerprint): the
            // same statement imported by two tabs at once still ends up once.
            // The second import waits for the account lock, then finds the
            // rows there.
            const { count } = await tx.transaction.createMany({
              data: rows.map((row) => ({
                userId: job.user_id,
                accountId: job.account_id,
                categoryId: row.categoryId,
                amount: row.amount ?? 0,
                comment: row.description,
                occurredAt: row.occurredAt ?? new Date(),
                importId: job.id,
                importFingerprint: row.fingerprint,
              })),
              skipDuplicates: true,
            });
            await tx.importRow.updateMany({
              where: {
                importId: job.id,
                line: { in: rows.map((row) => row.line) },
              },
              data: { status: 'imported' },
            });
            imported += count;
            done += rows.length;
            if (!(await this.progress(job.id, done))) {
              throw new Error(`Import ${job.id} is gone`);
            }
          }

          await this.accounts.assertNotNegative(
            tx,
            job.user_id,
            [job.account_id],
            'categories',
          );
          await tx.import.update({
            where: { id: job.id },
            data: {
              status: 'done',
              processed: done,
              importedRows: imported,
              // Found imported meanwhile (another import of the same rows).
              duplicateRows: { increment: done - imported },
              newRows: imported,
              lockedUntil: null,
              error: null,
            },
          });
          // The staging rows have served their purpose.
          await tx.importRow.deleteMany({ where: { importId: job.id } });
        },
        // Large files take seconds; the default limit is 5 s.
        { timeout: 10 * 60_000, maxWait: 30_000 },
      );
    } catch (error) {
      // The user can fix it and confirm again: back to "ready", with why.
      const reason = this.userFixable(error);
      if (reason === null) throw error;
      await this.prisma.import.updateMany({
        where: { id: job.id, status: 'importing' },
        data: {
          status: 'ready',
          processed: 0,
          error: reason,
          lockedUntil: null,
          attempts: 0,
        },
      });
    }
  }

  private userFixable(error: unknown): string | null {
    if (error instanceof AppException && error.code === 'INSUFFICIENT_FUNDS') {
      return error.details?.[0]?.message ?? 'На счёте не хватит денег';
    }
    // A chosen category was deleted after the confirmation.
    if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
      return 'Одна из выбранных категорий удалена — выберите заново';
    }
    return null;
  }

  /**
   * Shows progress and renews the lease. With `done` unset, counts the
   * parsed rows (exact even if two workers overlapped). false: the import
   * was deleted meanwhile.
   */
  private async progress(id: string, done?: number): Promise<boolean> {
    const processed =
      done ??
      (await this.prisma.importRow.count({
        where: { importId: id, status: { not: null } },
      }));
    const updated = await this.prisma.$executeRaw`
      UPDATE imports
      SET processed = ${processed}, locked_until = now() + ${LEASE}::interval,
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
    return updated > 0;
  }

  private async fail(id: string, error: string): Promise<void> {
    this.logger.warn({ importId: id }, 'Import failed too many times');
    await this.prisma.import.update({
      where: { id },
      data: { status: 'failed', error, lockedUntil: null },
    });
  }
}
