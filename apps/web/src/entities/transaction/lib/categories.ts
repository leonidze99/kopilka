import type { Transaction } from '../api/transaction-api';

type Categorized = Exclude<Transaction, { type: 'transfer' }>;
type Category = NonNullable<Categorized['category']>;

/**
 * The categories of an income or expense: its own, or those of its parts,
 * largest part first. None for a transfer.
 */
export function categoriesOf(transaction: Transaction): Category[] {
  if (transaction.type === 'transfer') return [];
  return transaction.category
    ? [transaction.category]
    : transaction.splits.map((split) => split.category);
}

/** What a transaction is called: its category, its parts' ones, or a transfer. */
export function transactionTitle(transaction: Transaction): string {
  if (transaction.type === 'transfer') return 'Перевод';
  return categoriesOf(transaction)
    .map((category) => category.name)
    .join(', ');
}
