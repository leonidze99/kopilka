import {
  ArrowLeftRight,
  ChevronRight,
  ReceiptText,
  Repeat,
  SearchX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useListAccountsQuery } from '@/entities/account';
import {
  CategoryAvatar,
  KIND_TITLES,
  useListCategoriesQuery,
} from '@/entities/category';
import {
  categoriesOf,
  type Transaction,
  transactionTitle,
  type TransactionType,
  useListTransactionsInfiniteQuery,
} from '@/entities/transaction';
import { DeleteTransactionButton } from '@/features/transaction-delete';
import { ExportCsvButton } from '@/features/transaction-export';
import { EditTransactionForm } from '@/features/transaction-form';
import {
  dayKey,
  errorMessage,
  formatDayHeading,
  formatMoney,
  formatMonthIn,
  formatSignedMoney,
  formatTime,
  highlight,
  type Month,
  monthPeriod,
} from '@/shared/lib';
import {
  Button,
  Dialog,
  EmptyState,
  FormError,
  Panel,
  SearchField,
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
  /** Search in comments, over all months; '' for none. */
  query: string;
  onQueryChange: (query: string) => void;
}

/** What the API searches for: from 2 characters, trimmed; else nothing. */
const searchable = (draft: string) =>
  draft.trim().length >= 2 ? draft.trim() : '';

const SEARCH_DELAY_MS = 300;

/**
 * The search box. Keeps what is typed and sends it once typing pauses: a
 * request per keystroke would be wasted, and each would replace the URL.
 */
function CommentSearch({
  query,
  onChange,
}: {
  query: string;
  onChange: (query: string) => void;
}) {
  const [draft, setDraft] = useState(query);
  const [seen, setSeen] = useState(query);
  // The query changed from outside (a reset, the back button): show it,
  // unless it is only the trimmed draft coming back ("яндекс " stays).
  if (query !== seen) {
    setSeen(query);
    if (searchable(draft) !== query) setDraft(query);
  }

  useEffect(() => {
    const next = searchable(draft);
    if (next === query) return;
    const timer = setTimeout(() => onChange(next), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [draft, query, onChange]);

  const short = draft.trim().length === 1;
  return (
    <div className={styles.search}>
      <SearchField
        label="Поиск по комментариям"
        placeholder="Поиск по комментариям"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {(query || short) && (
        <p className={styles.searchHint} aria-live="polite">
          {short ? 'Введите ещё хотя бы один символ' : 'Ищем во всех месяцах'}
        </p>
      )}
    </div>
  );
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
  query,
  onQueryChange,
}: TransactionListProps) {
  // A search looks through every month: "такси" means all the rides.
  const shown = query
    ? { ...filter, q: query }
    : { ...monthPeriod(month), ...filter };
  const {
    data,
    error,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useListTransactionsInfiniteQuery(shown);
  const transactions = data?.pages.flatMap((page) => page.items) ?? [];
  const [editing, setEditing] = useState<Transaction>();
  const filtered =
    !!query || Object.values(filter).some((value) => value !== undefined);
  // With one account, naming it on every row is noise.
  const { data: accounts } = useListAccountsQuery();
  const showAccount = (accounts?.items.length ?? 0) > 1;
  const closeEditor = () => setEditing(undefined);

  return (
    <Panel
      title="История"
      actions={
        <>
          <ExportCsvButton
            params={shown}
            name={`kopilka-${query ? 'search' : month}`}
          />
          <FilterSelect filter={filter} onChange={onFilterChange} />
        </>
      }
    >
      <CommentSearch query={query} onChange={onQueryChange} />
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
            onClick={() => {
              onFilterChange({});
              onQueryChange('');
            }}
          >
            {query ? 'Сбросить поиск' : 'Сбросить фильтр'}
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
                    categoryId={filter.categoryId}
                    query={query}
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
  /** The category the list is narrowed to: a split one shows its part. */
  categoryId?: string;
  /** The search: its matches in the comment are marked. */
  query: string;
}

/** A comment with what the search found in it marked. */
function Comment({ text, query }: { text: string; query: string }) {
  return highlight(text, query).map((part, index) =>
    part.match ? (
      <mark key={index} className={styles.match}>
        {part.text}
      </mark>
    ) : (
      part.text
    ),
  );
}

/** What a row shows: a category with its amount, or a transfer between accounts. */
function RowContent({
  transaction,
  showAccount,
  accountId,
  categoryId,
  query,
}: RowContentProps) {
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
            {transaction.comment && (
              <>
                {' · '}
                <Comment text={transaction.comment} query={query} />
              </>
            )}
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

  const categories = categoriesOf(transaction);
  // Narrowed to a category, a split receipt shows that category's part:
  // the rows then add up to what the chart says of the category.
  const part = transaction.splits.find(
    (split) => split.category.id === categoryId,
  );

  return (
    <>
      {categories.length > 1 ? (
        <span className={styles.splitAvatar} aria-hidden>
          {categories.slice(0, 2).map((category) => (
            <CategoryAvatar
              key={category.id}
              category={category}
              size="sm"
              className={styles.splitAvatarPart}
            />
          ))}
        </span>
      ) : (
        categories[0] && (
          <CategoryAvatar category={categories[0]} className={styles.avatar} />
        )
      )}
      <span className={styles.main}>
        <span className={styles.category}>
          {transactionTitle(transaction)}
          {categories.length > 1 && (
            <>
              {/* Outside the span: a leading space inside it is dropped
                  from the accessible name. */}{' '}
              <span className="visually-hidden">(разделённая операция)</span>
            </>
          )}
          <RecurringMark transaction={transaction} />
        </span>
        {(part || transaction.comment) && (
          <span className={styles.comment}>
            {part && `Часть от ${formatMoney(transaction.amount)}`}
            {part && transaction.comment && ' · '}
            {transaction.comment && (
              <Comment text={transaction.comment} query={query} />
            )}
          </span>
        )}
      </span>
      <span className={styles.side}>
        <span className={`${styles.amount} ${styles[transaction.type]}`}>
          {formatSignedMoney(
            part?.amount ?? transaction.amount,
            transaction.type,
          )}
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
