import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountsService, type Tx } from '../accounts/accounts.service.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { addInterval, dateOf, toDateColumn } from './schedule.js';

interface DueRule {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  to_account_id: string | null;
  amount: Prisma.Decimal;
  comment: string | null;
  start_on: Date;
  every: number;
  unit: 'day' | 'week' | 'month';
  next_on: Date;
  next_index: number;
  kind: 'income' | 'expense' | null;
  /** The start of the payment day in the rule's zone. */
  occurs_at: Date;
}

/** Payments made per tick at most: a long outage catches up over a few ticks. */
const BATCH = 500;

const dayFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Makes the payments of recurring rules when they are due. Postgres is the
 * queue: rows of recurring_rules, picked with FOR UPDATE SKIP LOCKED, so
 * several app instances share the work instead of doing it twice. Each
 * payment is one short transaction: create the transaction and move the
 * rule to its next date together, or neither.
 */
@Injectable()
export class RecurringRunner {
  private readonly logger = new Logger(RecurringRunner.name);
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    config: ConfigService<Env, true>,
  ) {
    this.enabled = config.get('JOBS_ENABLED', { infer: true });
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'recurring-payments' })
  async tick(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.runDue(new Date());
    } catch (error) {
      // The next tick tries again; nothing is half-done (one transaction each).
      this.logger.error(error, 'Recurring payments failed');
    }
  }

  /**
   * Makes every payment due by `now` (a parameter, so tests can move the
   * clock), oldest first; a rule several months behind catches up one
   * month per loop. Returns how many payments were handled.
   *
   * `scope.userId`: only that user's rules. For tests, which share one
   * database: a suite moving the clock months ahead must not make the
   * payments of rules other suites (or the demo seed) created.
   */
  async runDue(now: Date, scope: { userId?: string } = {}): Promise<number> {
    let handled = 0;
    while (handled < BATCH && (await this.runOne(now, scope.userId))) {
      handled++;
    }
    if (handled > 0) this.logger.log({ handled }, 'Recurring payments made');
    return handled;
  }

  private runOne(now: Date, userId?: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const rule = await this.claimDue(tx, now, userId);
      if (!rule) return false;

      const accounts = [rule.account_id, rule.to_account_id].filter(
        (id): id is string => id !== null,
      );
      // Same lock as a user's write: a payment and a manual expense on one
      // account cannot both pass the balance check.
      await this.accounts.lock(
        tx,
        rule.user_id,
        accounts.map((id) => ({ id, field: 'accountId' })),
        () => new Error(`Accounts of recurring rule ${rule.id} are gone`),
      );

      const on = dateOf(rule.next_on);
      const lastError = await this.make(tx, rule, on);

      const nextIndex = rule.next_index + 1;
      await tx.recurringRule.update({
        where: { id: rule.id },
        data: {
          nextIndex,
          nextOn: toDateColumn(
            addInterval(dateOf(rule.start_on), nextIndex, {
              every: rule.every,
              unit: rule.unit,
            }),
          ),
          lastError,
        },
      });
      return true;
    });
  }

  /**
   * The oldest due rule, locked; rules another runner holds are skipped,
   * not waited for. Due: the payment day has begun in the rule's zone. The
   * first condition is an index range (no zone is more than 14 hours ahead
   * of UTC), the second the exact per-zone check.
   */
  private async claimDue(
    tx: Tx,
    now: Date,
    userId?: string,
  ): Promise<DueRule | undefined> {
    const [rule] = await tx.$queryRaw<DueRule[]>`
      SELECT r.id, r.user_id, r.account_id, r.category_id, r.to_account_id,
             r.amount, r.comment, r.start_on, r.every, r.unit,
             r.next_on, r.next_index,
             c.kind,
             (r.next_on::timestamp AT TIME ZONE r.time_zone) AS occurs_at
      FROM recurring_rules r
      LEFT JOIN categories c ON c.id = r.category_id
      WHERE r.active
        AND r.next_on <= ((${now}::timestamptz + interval '14 hours') AT TIME ZONE 'UTC')::date
        AND r.next_on <= (${now}::timestamptz AT TIME ZONE r.time_zone)::date
        ${userId ? Prisma.sql`AND r.user_id = ${userId}::uuid` : Prisma.empty}
      ORDER BY r.next_on, r.id
      LIMIT 1
      FOR UPDATE OF r SKIP LOCKED
    `;
    return rule;
  }

  /**
   * Creates the transaction of one occurrence, or explains why not. Returns
   * the error to keep on the rule (null: made).
   */
  private async make(
    tx: Tx,
    rule: DueRule,
    on: string,
  ): Promise<string | null> {
    // Idempotency: the unique (rule, date) index makes a second transaction
    // impossible; checking first keeps the database transaction usable.
    const made = await tx.transaction.findUnique({
      where: {
        recurringRuleId_recurringOn: {
          recurringRuleId: rule.id,
          recurringOn: rule.next_on,
        },
      },
      select: { id: true },
    });
    if (made) return null;

    // Income adds money; an expense or a transfer takes it off the account.
    if (rule.kind !== 'income') {
      const shortfall = await this.accounts.shortfall(
        tx,
        rule.user_id,
        rule.account_id,
        new Prisma.Decimal(rule.amount),
      );
      if (shortfall) {
        this.logger.warn(
          { ruleId: rule.id, on },
          'Recurring payment skipped: account must not go negative',
        );
        return `${dayFormat.format(rule.next_on)}: на счёте «${shortfall.account}» не хватило ${shortfall.missing}`;
      }
    }

    await tx.transaction.create({
      data: {
        userId: rule.user_id,
        accountId: rule.account_id,
        categoryId: rule.category_id,
        toAccountId: rule.to_account_id,
        amount: rule.amount,
        comment: rule.comment,
        occurredAt: rule.occurs_at,
        recurringRuleId: rule.id,
        recurringOn: rule.next_on,
      },
    });
    return null;
  }
}
