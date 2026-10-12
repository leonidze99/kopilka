import { Plus, Target } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
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
} from '@/shared/ui';
import styles from './BudgetPanel.module.css';

/** Close to the limit: the bar warns before it is crossed. */
const WARN_AT = 0.85;

/** How full a budget is; display only (Number), the API did the sums. */
function usage(budget: Pick<Budget, 'limit' | 'spent'>) {
  const share = Number(budget.spent) / Number(budget.limit);
  return {
    width: `${Math.min(share, 1) * 100}%`,
    tone: share > 1 ? 'over' : share >= WARN_AT ? 'warn' : 'ok',
  } as const;
}

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
  const { width, tone } = usage(total);
  return (
    <div className={styles.total}>
      <div className={styles.totalText}>
        <span>
          Потрачено <strong>{formatMoney(total.spent)}</strong> из{' '}
          {formatMoney(total.limit)}
        </span>
        <Remaining remaining={total.remaining} />
      </div>
      <Bar width={width} tone={tone} />
    </div>
  );
}

function BudgetRow({ budget, onOpen }: { budget: Budget; onOpen: () => void }) {
  const { width, tone } = usage(budget);
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
        <Bar width={width} tone={tone} />
        <Remaining remaining={budget.remaining} />
      </span>
    </button>
  );
}

function Bar({ width, tone }: { width: string; tone: string }) {
  return (
    <span className={styles.track} aria-hidden>
      <span
        className={`${styles.fill} ${styles[tone]}`}
        style={{ '--width': width } as CSSProperties}
      />
    </span>
  );
}

function Remaining({ remaining }: { remaining: string }) {
  const over = remaining.startsWith('-');
  return (
    <span className={over ? styles.overspent : styles.left}>
      {over
        ? `Перерасход ${formatMoney(remaining.slice(1))}`
        : `Осталось ${formatMoney(remaining)}`}
    </span>
  );
}
