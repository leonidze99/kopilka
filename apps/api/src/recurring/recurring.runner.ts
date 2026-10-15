import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AccountsService, type Tx } from '../accounts/accounts.service.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService } from '../rates/rates.service.js';
import { addInterval, dateOf, toDateColumn, todayIn } from './schedule.js';

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
    private readonly rates: RatesService,
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
    await this.loadRates(now, scope.userId);
    let handled = 0;
    while (handled < BATCH && (await this.runOne(now, scope.userId))) {
      handled++;
    }
    if (handled > 0) this.logger.log({ handled }, 'Recurring payments made');
    return handled;
  }

  /**
   * The rates the due payments on foreign accounts convert with, loaded
   * before any transaction starts: from the oldest due date to today.
   */
  private async loadRates(now: Date, userId?: string): Promise<void> {
    const due = await this.prisma.$queryRaw<
      { currency: string; base: string; first: Date }[]
    >`
      SELECT a.currency, u.base_currency AS base, min(r.next_on) AS first
      FROM recurring_rules r
      JOIN accounts a ON a.id = r.account_id
      JOIN users u ON u.id = r.user_id
      WHERE r.active
        AND r.next_on <= (${now}::timestamptz AT TIME ZONE r.time_zone)::date
        AND a.currency <> u.base_currency
        ${userId ? Prisma.sql`AND r.user_id = ${userId}::uuid` : Prisma.empty}
      GROUP BY 1, 2
    `;
    const to = todayIn('UTC', now);
    await this.rates.ensure(
      due.flatMap(({ currency, base, first }) => {
        const from = dateOf(first);
        return [
          { currency, from, to },
          { currency: base, from, to },
        ];
      }),
    );
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
      const skipped = await this.make(tx, rule, on);
      // Remembered for the letter (RecurringAlertsService): last_error
      // keeps only the latest, and a payment that goes through clears it.
      if (skipped) {
        await tx.recurringSkip.createMany({
          data: {
            userId: rule.user_id,
            ruleId: rule.id,
            onDate: rule.next_on,
            reason: skipped,
          },
          skipDuplicates: true,
        });
      }
      const lastError =
        skipped && `${dayFormat.format(rule.next_on)}: ${skipped}`;

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
             -- A split rule has its kind in its parts, all of one kind.
             COALESCE(c.kind, (
               SELECT pc.kind FROM recurring_rule_splits p
               JOIN categories pc ON pc.id = p.category_id
               WHERE p.rule_id = r.id
               LIMIT 1
             )) AS kind,
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
   * why it was skipped, as the user reads it (null: made).
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
        return `на счёте «${shortfall.account}» не хватило ${shortfall.missing}`;
      }
    }

    // The trigger would refuse the insert without a rate and abort the
    // whole transaction; asked first, the date is skipped like one
    // without money, and the rule goes on.
    const [rate] = await tx.$queryRaw<{ currency: string; known: boolean }[]>`
      SELECT a.currency,
             exchange_rate(a.currency, (${rule.occurs_at}::timestamptz AT TIME ZONE u.time_zone)::date)
             / exchange_rate(u.base_currency, (${rule.occurs_at}::timestamptz AT TIME ZONE u.time_zone)::date)
               IS NOT NULL AS known
      FROM accounts a JOIN users u ON u.id = a.user_id
      WHERE a.id = ${rule.account_id}::uuid
    `;
    if (rate && !rate.known) {
      this.logger.warn(
        { ruleId: rule.id, on, currency: rate.currency },
        'Recurring payment skipped: no exchange rate',
      );
      return `нет курса ЦБ для ${rate.currency}`;
    }

    const { id } = await tx.transaction.create({
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
      select: { id: true },
    });
    // A split rule makes a split transaction: its parts, copied. They add
    // up to the amount (the service checked; the deferred trigger checks
    // the transaction again at commit).
    const parts = await tx.recurringRuleSplit.findMany({
      where: { ruleId: rule.id },
      select: { categoryId: true, amount: true },
    });
    if (parts.length > 0) {
      await tx.transactionSplit.createMany({
        data: parts.map((part) => ({
          transactionId: id,
          userId: rule.user_id,
          categoryId: part.categoryId,
          amount: part.amount,
        })),
      });
    }
    return null;
  }
}
