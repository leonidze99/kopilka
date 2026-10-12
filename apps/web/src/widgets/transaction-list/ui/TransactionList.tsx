import {
  ArrowLeftRight,
  ChevronRight,
  ReceiptText,
  Repeat,
  SearchX,
} from 'lucide-react';
import { useState } from 'react';
import { useListAccountsQuery } from '@/entities/account';
import {
  CategoryAvatar,
  KIND_TITLES,
  useListCategoriesQuery,
} from '@/entities/category';
import {
  type Transaction,
  type TransactionType,
  useListTransactionsInfiniteQuery,
} from '@/entities/transaction';
import { DeleteTransactionButton } from '@/features/transaction-delete';
import { EditTransactionForm } from '@/features/transaction-form';
import {
  dayKey,
  errorMessage,
  formatDayHeading,
  formatMoney,
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

/** Narrows the list: one type, one category or one account. */
export interface ListFilter {
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
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
  const filtered = Object.values(filter).some((value) => value !== undefined);
  // With one account, naming it on every row is noise.
  const { data: accounts } = useListAccountsQuery();
  const showAccount = (accounts?.items.length ?? 0) > 1;
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
                  <RowContent
                    transaction={transaction}
                    showAccount={showAccount}
                    accountId={filter.accountId}
                  />
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

/** Made by a recurring rule, not by hand. */
function RecurringMark({ transaction }: { transaction: Transaction }) {
  if (!transaction.recurringRuleId) return null;
  return (
    <span className={styles.recurring} title="Регулярная операция">
      <Repeat size={13} aria-hidden />
      <span className="visually-hidden">регулярная</span>
    </span>
  );
}

interface RowContentProps {
  transaction: Transaction;
  showAccount: boolean;
  /** The account the list is narrowed to: a transfer is out of or into it. */
  accountId?: string;
}

/** What a row shows: a category with its amount, or a transfer between accounts. */
function RowContent({ transaction, showAccount, accountId }: RowContentProps) {
  const time = (
    <time className={styles.time} dateTime={transaction.occurredAt}>
      {showAccount && transaction.type !== 'transfer'
        ? `${transaction.account.name} · `
        : ''}
      {formatTime(transaction.occurredAt)}
    </time>
  );

  if (transaction.type === 'transfer') {
    // Seen from one of its accounts a transfer has a direction; from all
    // of them it only moves money inside and changes no total.
    const direction =
      accountId === transaction.account.id
        ? 'expense'
        : accountId === transaction.toAccount.id
          ? 'income'
          : undefined;
    return (
      <>
        <span className={styles.transferIcon} aria-hidden>
          <ArrowLeftRight size={18} />
        </span>
        <span className={styles.main}>
          <span className={styles.category}>
            Перевод
            <RecurringMark transaction={transaction} />
          </span>
          <span className={styles.comment}>
            {transaction.account.name} → {transaction.toAccount.name}
            {transaction.comment && ` · ${transaction.comment}`}
          </span>
        </span>
        <span className={styles.side}>
          <span className={`${styles.amount} ${styles.transfer}`}>
            {direction
              ? formatSignedMoney(transaction.amount, direction)
              : formatMoney(transaction.amount)}
          </span>
          {time}
        </span>
      </>
    );
  }

  return (
    <>
      <CategoryAvatar
        category={transaction.category}
        className={styles.avatar}
      />
      <span className={styles.main}>
        <span className={styles.category}>
          {transaction.category.name}
          <RecurringMark transaction={transaction} />
        </span>
        {transaction.comment && (
          <span className={styles.comment}>{transaction.comment}</span>
        )}
      </span>
      <span className={styles.side}>
        <span className={`${styles.amount} ${styles[transaction.type]}`}>
          {formatSignedMoney(transaction.amount, transaction.type)}
        </span>
        {time}
      </span>
    </>
  );
}

const ALL = '';
const TYPE_PREFIX = 'type:';
const ACCOUNT_PREFIX = 'account:';

/**
 * One control for "all / a type / an account / a category": the list
 * shows one slice at a time, like the chart and the account strip set it.
 */
function FilterSelect({
  filter,
  onChange,
}: {
  filter: ListFilter;
  onChange: (filter: ListFilter) => void;
}) {
  const { data: categories = [] } = useListCategoriesQuery();
  const { data: accounts } = useListAccountsQuery();
  const value = filter.categoryId
    ? filter.categoryId
    : filter.accountId
      ? `${ACCOUNT_PREFIX}${filter.accountId}`
      : filter.type
        ? `${TYPE_PREFIX}${filter.type}`
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
          else if (next.startsWith(TYPE_PREFIX))
            onChange({
              type: next.slice(TYPE_PREFIX.length) as TransactionType,
            });
          else if (next.startsWith(ACCOUNT_PREFIX))
            onChange({ accountId: next.slice(ACCOUNT_PREFIX.length) });
          else onChange({ categoryId: next });
        }}
      >
        <option value={ALL}>Все операции</option>
        <option value={`${TYPE_PREFIX}expense`}>Все расходы</option>
        <option value={`${TYPE_PREFIX}income`}>Все доходы</option>
        <option value={`${TYPE_PREFIX}transfer`}>Все переводы</option>
        {accounts && accounts.items.length > 1 && (
          <optgroup label="Счета">
            {accounts.items.map((account) => (
              <option key={account.id} value={`${ACCOUNT_PREFIX}${account.id}`}>
                {account.name}
              </option>
            ))}
          </optgroup>
        )}
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
