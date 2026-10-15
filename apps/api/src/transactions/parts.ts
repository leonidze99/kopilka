import { Prisma } from '../generated/prisma/client.js';

/**
 * What income and expense by category are made of: a transaction with a
 * category, or each part of a split one (transaction_splits). Every total
 * by category goes through these, or a split receipt would count in no
 * category at all — its own category_id is NULL.
 *
 * Totals are in the user's base currency: transactions.base_amount (set by
 * the transactions_money trigger), never amount, which is in the currency
 * of each account and cannot be added across accounts.
 */

/**
 * Joined to `transactions t`: a row per part of a split transaction, the
 * transaction itself otherwise, with its category as `c`. A transfer has
 * neither a category nor parts: the inner join leaves it out.
 */
export const categorizedJoin = Prisma.sql`
  LEFT JOIN transaction_splits s ON s.transaction_id = t.id
  JOIN categories c ON c.id = COALESCE(s.category_id, t.category_id)`;

/**
 * A part's share of the transaction's base amount, unrounded: the parts
 * of one transaction then add up to exactly its base amount, and a total
 * is rounded once, at the end. The same as s.amount in the base currency.
 */
const partBaseAmount = Prisma.sql`s.amount * t.base_amount / t.amount`;

/**
 * The money of a row of `categorizedJoin` in the base currency: the
 * part's, or the transaction's. Not rounded: round the sum.
 */
export const categorizedAmount = Prisma.sql`COALESCE(${partBaseAmount}, t.base_amount)`;

/**
 * Spent under one tag over all time: its budget's measure. Expenses only,
 * a split one counting through its parts (they add up to it). A correlated
 * subquery finding the tag's transactions through the tag_id index.
 * Rounded once, so that limit minus spent is what the user reads.
 */
export const tagSpent = (tagId: Prisma.Sql) => Prisma.sql`round(COALESCE((
  SELECT SUM(${categorizedAmount})
  FROM transaction_tags tt
  JOIN transactions t ON t.id = tt.transaction_id
  ${categorizedJoin}
  WHERE tt.tag_id = ${tagId} AND c.kind = 'expense'
), 0), 2)`;

/**
 * Spent in one category over [from, to): its transactions plus its parts of
 * split ones. Two sums rather than the join above, as each finds its rows
 * through an index on category_id — a correlated subquery runs per budget.
 * Rounded once, as tagSpent.
 */
export const categorySpent = (
  categoryId: Prisma.Sql,
  from: Prisma.Sql,
  to: Prisma.Sql,
) => Prisma.sql`round(
  COALESCE((
    SELECT SUM(t.base_amount) FROM transactions t
    WHERE t.category_id = ${categoryId}
      AND t.occurred_at >= ${from} AND t.occurred_at < ${to}
  ), 0)
  + COALESCE((
    SELECT SUM(${partBaseAmount}) FROM transaction_splits s
    JOIN transactions t ON t.id = s.transaction_id
    WHERE s.category_id = ${categoryId}
      AND t.occurred_at >= ${from} AND t.occurred_at < ${to}
  ), 0),
2)`;
