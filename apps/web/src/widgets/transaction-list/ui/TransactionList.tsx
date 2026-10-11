import { ReceiptText } from 'lucide-react';
import { CategoryAvatar } from '@/entities/category';
import {
  type Transaction,
  useListTransactionsInfiniteQuery,
} from '@/entities/transaction';
import { DeleteTransactionButton } from '@/features/transaction-delete';
import {
  dayKey,
  errorMessage,
  formatDayHeading,
  formatSignedMoney,
  formatTime,
} from '@/shared/lib';
import { Button, EmptyState, FormError, Panel } from '@/shared/ui';
import styles from './TransactionList.module.css';

/** Consecutive transactions of one local day; the list is newest first. */
function groupByDay(transactions: Transaction[]) {
  const days: { key: string; heading: string; items: Transaction[] }[] = [];
  for (const transaction of transactions) {
    const key = dayKey(transaction.occurredAt);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(transaction);
    else
      days.push({
        key,
        heading: formatDayHeading(transaction.occurredAt),
        items: [transaction],
      });
  }
  return days;
}

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
    <Panel title="История">
      {error && <FormError message={errorMessage(error)} />}
      {isLoading && <p className={styles.muted}>Загрузка…</p>}
      {!isLoading && !error && transactions.length === 0 && (
        <EmptyState icon={<ReceiptText size={22} />} title="Операций пока нет">
          Добавьте первую в форме «Новая операция».
        </EmptyState>
      )}

      {groupByDay(transactions).map(({ key, heading, items }) => (
        <section key={key} className={styles.day}>
          <h3 className={styles.dayTitle}>{heading}</h3>
          <ul className={styles.list} aria-label={heading}>
            {items.map((transaction) => (
              <li key={transaction.id} className={styles.item}>
                <CategoryAvatar category={transaction.category} />
                <div className={styles.main}>
                  <span className={styles.category}>
                    {transaction.category.name}
                  </span>
                  {transaction.comment && (
                    <span className={styles.comment}>
                      {transaction.comment}
                    </span>
                  )}
                </div>
                <div className={styles.side}>
                  <span
                    className={`${styles.amount} ${styles[transaction.category.kind]}`}
                  >
                    {formatSignedMoney(
                      transaction.amount,
                      transaction.category.kind,
                    )}
                  </span>
                  <time
                    className={styles.time}
                    dateTime={transaction.occurredAt}
                  >
                    {formatTime(transaction.occurredAt)}
                  </time>
                </div>
                <div className={styles.actions}>
                  <DeleteTransactionButton transaction={transaction} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

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
