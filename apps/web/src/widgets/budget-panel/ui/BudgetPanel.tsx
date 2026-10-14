import { Plus, Target } from 'lucide-react';
import { useState } from 'react';
import {
  type Budget,
  type BudgetList,
  useListBudgetsQuery,
} from '@/entities/budget';
import { CategoryAvatar } from '@/entities/category';
import { BudgetForm } from '@/features/budget-form';
import {
  errorMessage,
  formatMoney,
  formatMonthIn,
  type Month,
  monthPeriod,
} from '@/shared/lib';
import {
  Button,
  Dialog,
  EmptyState,
  FormError,
  Panel,
  Skeleton,
  UsageBar,
  UsageRemaining,
} from '@/shared/ui';
import styles from './BudgetPanel.module.css';

/** Limits of the month's expense categories against what was spent. */
export function BudgetPanel({ month }: { month: Month }) {
  const { data, error, isLoading } = useListBudgetsQuery({
    month,
    ...monthPeriod(month),
  });
  // undefined: closed; null: a new budget; a budget: editing it.
  const [editing, setEditing] = useState<Budget | null>();
  const close = () => setEditing(undefined);
  const items = data?.items ?? [];

  return (
    <Panel
      title="Бюджеты"
      actions={
        items.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing(null)}
          >
            <Plus size={16} aria-hidden />
            Добавить
          </Button>
        )
      }
    >
      {error && <FormError message={errorMessage(error)} />}
      {isLoading && <Skeleton height={56} radius={12} />}

      {data && items.length === 0 && (
        <EmptyState icon={<Target size={22} />} title="Бюджетов пока нет">
          Задайте лимит расходов по категориям — будет видно, сколько осталось
          до конца месяца.
          <Button
            variant="secondary"
            size="sm"
            className={styles.start}
            onClick={() => setEditing(null)}
          >
            <Plus size={16} aria-hidden />
            Задать бюджет
          </Button>
        </EmptyState>
      )}

      {data && items.length > 0 && (
        <>
          <Total total={data.total} />
          <ul
            className={styles.list}
            aria-label={`Бюджеты в ${formatMonthIn(month)}`}
          >
            {items.map((budget) => (
              <li key={budget.category.id}>
                <BudgetRow budget={budget} onOpen={() => setEditing(budget)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog
        open={editing !== undefined}
        onClose={close}
        title={editing ? `Бюджет: ${editing.category.name}` : 'Новый бюджет'}
      >
        {editing !== undefined && (
          <BudgetForm
            month={month}
            budget={editing ?? undefined}
            budgetedIds={items.map((budget) => budget.category.id)}
            onDone={close}
          />
        )}
      </Dialog>
    </Panel>
  );
}

function Total({ total }: { total: BudgetList['total'] }) {
  return (
    <div className={styles.total}>
      <div className={styles.totalText}>
        <span>
          Потрачено <strong>{formatMoney(total.spent)}</strong> из{' '}
          {formatMoney(total.limit)}
        </span>
        <UsageRemaining remaining={total.remaining} />
      </div>
      <UsageBar spent={total.spent} limit={total.limit} />
    </div>
  );
}

function BudgetRow({ budget, onOpen }: { budget: Budget; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={styles.row}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <CategoryAvatar category={budget.category} size="sm" />
      <span className={styles.main}>
        <span className={styles.head}>
          <span className={styles.name}>{budget.category.name}</span>
          <span className={styles.amounts}>
            {formatMoney(budget.spent)}
            <span className={styles.of}> из {formatMoney(budget.limit)}</span>
          </span>
        </span>
        <UsageBar spent={budget.spent} limit={budget.limit} />
        <UsageRemaining remaining={budget.remaining} />
      </span>
    </button>
  );
}
