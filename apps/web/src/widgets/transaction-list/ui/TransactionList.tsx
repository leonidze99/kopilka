import { useListTransactionsInfiniteQuery } from '@/entities/transaction';
import { DeleteTransactionButton } from '@/features/transaction-delete';
import { errorMessage, formatDay, formatSignedMoney } from '@/shared/lib';
import { Button, FormError, Panel } from '@/shared/ui';
import styles from './TransactionList.module.css';

/** All transactions, newest first, loaded page by page with a cursor. */
export function TransactionList() {
  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useListTransactionsInfiniteQuery();
  const transactions = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Panel title="Операции">
      {error && <FormError message={errorMessage(error)} />}
      {isLoading && <p className={styles.muted}>Загрузка…</p>}
      {!isLoading && !error && transactions.length === 0 && (
        <p className={styles.muted}>Операций пока нет. Добавьте первую выше.</p>
      )}

      {transactions.length > 0 && (
        <ul className={styles.list}>
          {transactions.map((transaction) => (
            <li key={transaction.id} className={styles.item}>
              <div className={styles.main}>
                <span className={styles.category}>
                  {transaction.category.name}
                </span>
                <span className={styles.meta}>
                  {formatDay(transaction.occurredAt)}
                  {transaction.comment && ` · ${transaction.comment}`}
                </span>
              </div>
              <span
                className={`${styles.amount} ${styles[transaction.category.kind]}`}
              >
                {formatSignedMoney(
                  transaction.amount,
                  transaction.category.kind,
                )}
              </span>
              <DeleteTransactionButton transaction={transaction} />
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <Button
          variant="secondary"
          className={styles.more}
          loading={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          Показать ещё
        </Button>
      )}
    </Panel>
  );
}
