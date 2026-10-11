import { ChevronRight, ReceiptText, SearchX } from 'lucide-react';
import { useState } from 'react';
import {
  CategoryAvatar,
  KIND_TITLES,
  type TransactionKind,
  useListCategoriesQuery,
} from '@/entities/category';
import {
  type Transaction,
  useListTransactionsInfiniteQuery,
} from '@/entities/transaction';
import { DeleteTransactionButton } from '@/features/transaction-delete';
import { EditTransactionForm } from '@/features/transaction-form';
import {
  dayKey,
  errorMessage,
  formatDayHeading,
  formatMonthIn,
  formatSignedMoney,
  formatTime,
  type Month,
  monthPeriod,
} from '@/shared/lib';
import {
  Button,
  Dialog,
  EmptyState,
  FormError,
  Panel,
  SelectField,
  Skeleton,
} from '@/shared/ui';
import styles from './TransactionList.module.css';

/** Narrows the list: one kind, or one category. */
export interface ListFilter {
  kind?: TransactionKind;
  categoryId?: string;
}

interface TransactionListProps {
  month: Month;
  filter: ListFilter;
  onFilterChange: (filter: ListFilter) => void;
}

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

// Just added by this user: worth an entrance animation.
const isFresh = (transaction: Transaction) =>
  Date.now() - Date.parse(transaction.createdAt) < 10_000;

/** Transactions of a month, newest first, loaded page by page with a cursor. */
export function TransactionList({
  month,
  filter,
  onFilterChange,
}: TransactionListProps) {
  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useListTransactionsInfiniteQuery({ ...monthPeriod(month), ...filter });
  const transactions = data?.pages.flatMap((page) => page.items) ?? [];
  const [editing, setEditing] = useState<Transaction>();
  const filtered = filter.kind !== undefined || filter.categoryId !== undefined;
  const closeEditor = () => setEditing(undefined);

  return (
    <Panel
      title="История"
      actions={<FilterSelect filter={filter} onChange={onFilterChange} />}
    >
      {error && <FormError message={errorMessage(error)} />}
      {isLoading && <ListSkeleton />}
      {!isLoading && !error && transactions.length === 0 && !filtered && (
        <EmptyState icon={<ReceiptText size={22} />} title="Операций пока нет">
          {`В ${formatMonthIn(month)} ничего не записано.`}
        </EmptyState>
      )}
      {!isLoading && !error && transactions.length === 0 && filtered && (
        <EmptyState icon={<SearchX size={22} />} title="Ничего не найдено">
          <Button
            variant="secondary"
            size="sm"
            className={styles.reset}
            onClick={() => onFilterChange({})}
          >
            Сбросить фильтр
          </Button>
        </EmptyState>
      )}

      {groupByDay(transactions).map(({ key, heading, items }) => (
        <section key={key} className={styles.day}>
          <h3 className={styles.dayTitle}>{heading}</h3>
          <ul className={styles.list} aria-label={heading}>
            {items.map((transaction) => (
              <li
                key={transaction.id}
                className={isFresh(transaction) ? styles.fresh : undefined}
              >
                <button
                  type="button"
                  className={styles.item}
                  aria-haspopup="dialog"
                  onClick={() => setEditing(transaction)}
                >
                  <CategoryAvatar
                    category={transaction.category}
                    className={styles.avatar}
                  />
                  <span className={styles.main}>
                    <span className={styles.category}>
                      {transaction.category.name}
                    </span>
                    {transaction.comment && (
                      <span className={styles.comment}>
                        {transaction.comment}
                      </span>
                    )}
                  </span>
                  <span className={styles.side}>
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
                  </span>
                  <ChevronRight
                    className={styles.chevron}
                    size={18}
                    aria-hidden
                  />
                </button>
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

      <Dialog open={!!editing} onClose={closeEditor} title="Операция">
        {editing && (
          <EditTransactionForm
            transaction={editing}
            onSaved={closeEditor}
            footer={
              <DeleteTransactionButton
                transaction={editing}
                onDeleted={closeEditor}
              />
            }
          />
        )}
      </Dialog>
    </Panel>
  );
}

const ALL = '';
const KIND_PREFIX = 'kind:';

/** One control for "all / a kind / a category": the API ANDs them anyway. */
function FilterSelect({
  filter,
  onChange,
}: {
  filter: ListFilter;
  onChange: (filter: ListFilter) => void;
}) {
  const { data: categories = [] } = useListCategoriesQuery();
  const value = filter.categoryId
    ? filter.categoryId
    : filter.kind
      ? `${KIND_PREFIX}${filter.kind}`
      : ALL;

  return (
    <div className={styles.filter}>
      <SelectField
        label="Показать"
        hideLabel
        compact
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next === ALL) onChange({});
          else if (next.startsWith(KIND_PREFIX))
            onChange({
              kind: next.slice(KIND_PREFIX.length) as TransactionKind,
            });
          else onChange({ categoryId: next });
        }}
      >
        <option value={ALL}>Все операции</option>
        <option value={`${KIND_PREFIX}expense`}>Все расходы</option>
        <option value={`${KIND_PREFIX}income`}>Все доходы</option>
        {(['expense', 'income'] as const).map((kind) => (
          <optgroup key={kind} label={KIND_TITLES[kind]}>
            {categories
              .filter((category) => category.kind === kind)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </optgroup>
        ))}
      </SelectField>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className={styles.skeleton} aria-label="Загрузка операций">
      <Skeleton width={90} height={10} />
      {[55, 40, 65, 45].map((width) => (
        <div key={width} className={styles.skeletonRow}>
          <Skeleton width={40} height={40} radius={12} />
          <div className={styles.skeletonText}>
            <Skeleton width={`${width}%`} />
            <Skeleton width={`${width / 2}%`} height={10} />
          </div>
          <Skeleton width={80} />
        </div>
      ))}
    </div>
  );
}
