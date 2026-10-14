import { Prisma } from '../generated/prisma/client.js';

/**
 * What income and expense by category are made of: a transaction with a
 * category, or each part of a split one (transaction_splits). Every total
 * by category goes through these, or a split receipt would count in no
 * category at all — its own category_id is NULL.
 */

/**
 * Joined to `transactions t`: a row per part of a split transaction, the
 * transaction itself otherwise, with its category as `c`. A transfer has
 * neither a category nor parts: the inner join leaves it out.
 */
export const categorizedJoin = Prisma.sql`
  LEFT JOIN transaction_splits s ON s.transaction_id = t.id
  JOIN categories c ON c.id = COALESCE(s.category_id, t.category_id)`;

/** The money of a row of `categorizedJoin`: the part's, or the transaction's. */
export const categorizedAmount = Prisma.sql`COALESCE(s.amount, t.amount)`;

/**
 * Spent under one tag over all time: its budget's measure. Expenses only,
 * a split one counting through its parts (they add up to it). A correlated
 * subquery finding the tag's transactions through the tag_id index.
 */
export const tagSpent = (tagId: Prisma.Sql) => Prisma.sql`COALESCE((
  SELECT SUM(${categorizedAmount})
  FROM transaction_tags tt
  JOIN transactions t ON t.id = tt.transaction_id
  ${categorizedJoin}
  WHERE tt.tag_id = ${tagId} AND c.kind = 'expense'
), 0)`;

/**
 * Spent in one category over [from, to): its transactions plus its parts of
 * split ones. Two sums rather than the join above, as each finds its rows
 * through an index on category_id — a correlated subquery runs per budget.
 */
export const categorySpent = (
  categoryId: Prisma.Sql,
  from: Prisma.Sql,
  to: Prisma.Sql,
) => Prisma.sql`(
  COALESCE((
    SELECT SUM(t.amount) FROM transactions t
    WHERE t.category_id = ${categoryId}
      AND t.occurred_at >= ${from} AND t.occurred_at < ${to}
  ), 0)
  + COALESCE((
    SELECT SUM(s.amount) FROM transaction_splits s
    JOIN transactions t ON t.id = s.transaction_id
    WHERE s.category_id = ${categoryId}
      AND t.occurred_at >= ${from} AND t.occurred_at < ${to}
  ), 0)
)`;
