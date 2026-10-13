import { hash } from '@node-rs/argon2';
import type { PrismaClient } from '../generated/prisma/client.js';
import { toDateColumn } from '../recurring/schedule.js';
import {
  type AccountKey,
  buildDemoData,
  type CategoryKey,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_TIME_ZONE,
  type RuleKey,
} from './demo-data.js';

export interface SeedResult {
  email: string;
  password: string;
  transactions: number;
}

/**
 * Replaces the demo user with a fresh one: deletes it (everything of it
 * goes by ON DELETE CASCADE) and creates it again, in one transaction. No
 * other user is touched, so it is safe on a database with real users.
 *
 * Writes through Prisma directly, not through the services: it creates
 * months of history at once (including payments "made" by recurring
 * rules), which the API never does. What keeps it honest is the check at
 * the end and the e2e test reading the result back through the API.
 */
export async function seedDemo(
  prisma: PrismaClient,
  now = new Date(),
): Promise<SeedResult> {
  const data = buildDemoData(now);
  // argon2 takes ~50 ms of CPU: outside the transaction.
  const passwordHash = await hash(DEMO_PASSWORD);

  await prisma.$transaction(
    async (tx) => {
      await tx.user.deleteMany({ where: { email: DEMO_EMAIL } });
      const { id: userId } = await tx.user.create({
        data: {
          email: DEMO_EMAIL,
          passwordHash,
          timeZone: DEMO_TIME_ZONE,
          // Nobody reads that mailbox: the demo budgets are overspent on
          // purpose and would mail about it every month.
          budgetAlerts: false,
        },
        select: { id: true },
      });

      const accounts = new Map<AccountKey, string>();
      for (const { key, ...account } of data.accounts) {
        const { id } = await tx.account.create({
          data: { userId, ...account },
          select: { id: true },
        });
        accounts.set(key, id);
      }
      // One by one, in order: UUIDv7 ids follow creation order, and the
      // colour of a category is its place in that order.
      const categories = new Map<CategoryKey, string>();
      for (const { key, ...category } of data.categories) {
        const { id } = await tx.category.create({
          data: { userId, ...category },
          select: { id: true },
        });
        categories.set(key, id);
      }
      const idOf = <K>(ids: Map<K, string>, key: K | undefined) =>
        key === undefined ? null : (ids.get(key) ?? null);

      const rules = new Map<RuleKey, string>();
      for (const rule of data.rules) {
        const { id } = await tx.recurringRule.create({
          data: {
            userId,
            accountId: idOf(accounts, rule.account) ?? '',
            categoryId: idOf(categories, rule.category),
            toAccountId: idOf(accounts, rule.toAccount),
            amount: rule.amount,
            comment: rule.comment,
            startOn: toDateColumn(rule.startOn),
            timeZone: DEMO_TIME_ZONE,
            nextOn: toDateColumn(rule.nextOn),
            nextIndex: rule.nextIndex,
          },
          select: { id: true },
        });
        rules.set(rule.key, id);
      }

      await tx.transaction.createMany({
        data: data.transactions.map((t) => ({
          userId,
          accountId: idOf(accounts, t.account) ?? '',
          categoryId: idOf(categories, t.category),
          toAccountId: idOf(accounts, t.toAccount),
          amount: t.amount,
          comment: t.comment,
          occurredAt: t.occurredAt,
          recurringRuleId: t.rule ? idOf(rules, t.rule.key) : null,
          recurringOn: t.rule ? toDateColumn(t.rule.on) : null,
        })),
      });

      await tx.budget.createMany({
        data: data.budgets.map((budget) => ({
          userId,
          categoryId: idOf(categories, budget.category) ?? '',
          amount: budget.amount,
          effectiveFrom: toDateColumn(budget.effectiveFrom),
        })),
      });

      await tx.goal.create({
        data: {
          userId,
          accountId: idOf(accounts, data.goal.account) ?? '',
          name: data.goal.name,
          targetAmount: data.goal.targetAmount,
          targetDate: toDateColumn(data.goal.targetDate),
        },
      });

      // The rule the API enforces on every write: an account that must not
      // go negative is not below zero. Generated data could break it.
      const overdrawn = await tx.$queryRaw<{ name: string }[]>`
        SELECT a.name FROM accounts a
        WHERE a.user_id = ${userId}::uuid AND NOT a.allow_negative
          AND a.opening_balance
            + COALESCE((SELECT SUM(CASE WHEN c.kind = 'income' THEN t.amount ELSE -t.amount END)
                        FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
                        WHERE t.account_id = a.id), 0)
            + COALESCE((SELECT SUM(t.amount) FROM transactions t
                        WHERE t.to_account_id = a.id), 0) < 0
      `;
      if (overdrawn.length > 0) {
        throw new Error(
          `Demo data overdraws ${overdrawn.map((a) => a.name).join(', ')}`,
        );
      }
    },
    // Hundreds of rows in one transaction; the default limit is 5 s.
    { timeout: 60_000 },
  );

  return {
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    transactions: data.transactions.length,
  };
}
