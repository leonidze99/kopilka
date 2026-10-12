import { Plus } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CreateTransactionForm } from '@/features/transaction-form';
import { currentMonth, type Month, parseMonth } from '@/shared/lib';
import { Dialog, MonthSwitcher, Panel } from '@/shared/ui';
import { AccountStrip } from '@/widgets/account-strip';
import { BudgetPanel } from '@/widgets/budget-panel';
import { CategoryBreakdown } from '@/widgets/category-breakdown';
import { MonthSummary } from '@/widgets/month-summary';
import { MonthlyTrend } from '@/widgets/monthly-trend';
import { type ListFilter, TransactionList } from '@/widgets/transaction-list';
import styles from '../../page.module.css';

const parseType = (value: string | null) =>
  value === 'income' || value === 'expense' || value === 'transfer'
    ? value
    : undefined;

/**
 * The month and the list filter live in the URL: they survive a reload and
 * the back button, and a link opens the same view.
 */
function useOperationsView() {
  const [params, setParams] = useSearchParams();
  const month = parseMonth(params.get('month')) ?? currentMonth();
  const filter: ListFilter = {
    type: parseType(params.get('type')),
    categoryId: params.get('category') ?? undefined,
    accountId: params.get('account') ?? undefined,
  };

  const update = useCallback(
    (changes: Record<string, string | undefined>) =>
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Stable: the search box waits for a pause in typing with it.
  const setQuery = useCallback(
    (query: string) => update({ q: query || undefined }),
    [update],
  );

  return {
    month,
    filter,
    /** Search in comments, independent of the filter. */
    query: params.get('q') ?? '',
    setQuery,
    setMonth: (next: Month) =>
      // The current month is the default: keep the URL clean.
      update({ month: next === currentMonth() ? undefined : next }),
    setFilter: ({ type, categoryId, accountId }: ListFilter) =>
      update({ type, category: categoryId, account: accountId }),
  };
}

export function TransactionsPage() {
  const { month, filter, query, setMonth, setFilter, setQuery } =
    useOperationsView();
  const [adding, setAdding] = useState(false);

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <h1 className={styles.title}>Операции</h1>
        <MonthSwitcher value={month} onChange={setMonth} />
      </div>
      <MonthSummary month={month} />
      <AccountStrip
        selectedId={filter.accountId}
        onSelect={(accountId) => setFilter({ accountId })}
      />
      <div className={styles.columns}>
        <div className={styles.stack}>
          <CategoryBreakdown
            month={month}
            selectedId={filter.categoryId}
            onSelect={(categoryId) => setFilter({ categoryId })}
          />
          <MonthlyTrend month={month} onSelect={setMonth} />
          <BudgetPanel month={month} />
          <TransactionList
            month={month}
            filter={filter}
            onFilterChange={setFilter}
            query={query}
            onQueryChange={setQuery}
          />
        </div>
        <div className={`${styles.aside} ${styles.wideOnly}`}>
          <Panel title="Новая операция">
            <CreateTransactionForm />
          </Panel>
        </div>
      </div>

      {/* Narrow screens: the form opens from a button instead. */}
      <button
        type="button"
        className={styles.fab}
        aria-label="Новая операция"
        onClick={() => setAdding(true)}
      >
        <Plus size={26} aria-hidden />
      </button>
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Новая операция"
      >
        <CreateTransactionForm onCreated={() => setAdding(false)} />
      </Dialog>
    </div>
  );
}
