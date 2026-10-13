import { Target } from 'lucide-react';
import { useState } from 'react';
import { type Goal, useListGoalsQuery } from '@/entities/goal';
import { DeleteGoalButton } from '@/features/goal-delete';
import { GoalForm } from '@/features/goal-form';
import { errorMessage, formatMoney } from '@/shared/lib';
import { Dialog, EmptyState, FormError, Panel, Skeleton } from '@/shared/ui';
import styles from './GoalList.module.css';

const dayFormat = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  // A calendar date: read it as written, not shifted by a zone.
  timeZone: 'UTC',
});

const formatDate = (date: string) =>
  dayFormat.format(new Date(`${date}T00:00:00Z`));

/** What is left to do, in one line under the bar. */
function Progress({ goal }: { goal: Goal }) {
  if (goal.percent >= 100) return <>Цель достигнута</>;
  const left = `осталось ${formatMoney(goal.remaining)}`;
  if (!goal.targetDate) return <>{left}</>;
  return (
    <>
      {left} · к {formatDate(goal.targetDate)}
      {goal.monthly
        ? ` · по ${formatMoney(goal.monthly)} в месяц`
        : ' · срок прошёл'}
    </>
  );
}

/** Saving goals with their progress; a click opens one for editing. */
export function GoalList() {
  const { data, error, isLoading } = useListGoalsQuery();
  const [editing, setEditing] = useState<Goal>();
  const closeEditor = () => setEditing(undefined);

  if (error) return <FormError message={errorMessage(error)} />;

  return (
    <Panel title="Цели">
      {isLoading && <Skeleton height={96} />}
      {data?.length === 0 && (
        <EmptyState icon={<Target size={22} />} title="Целей пока нет">
          Выберите счёт и сумму — Копилка посчитает, сколько откладывать.
        </EmptyState>
      )}
      <ul className={styles.list}>
        {data?.map((goal) => (
          <li key={goal.id}>
            <button
              type="button"
              className={styles.item}
              aria-haspopup="dialog"
              onClick={() => setEditing(goal)}
            >
              <span className={styles.head}>
                <span className={styles.name}>{goal.name}</span>
                <span className={styles.amount}>
                  {formatMoney(goal.saved)}
                  <span className={styles.target}>
                    {' из '}
                    {formatMoney(goal.targetAmount)}
                  </span>
                </span>
              </span>
              <span
                className={styles.bar}
                role="progressbar"
                aria-label={`Накоплено по цели «${goal.name}»`}
                aria-valuenow={goal.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className={styles.fill}
                  data-done={goal.percent >= 100 || undefined}
                  style={{ width: `${goal.percent}%` }}
                />
              </span>
              <span className={styles.meta}>
                {goal.percent}% · {goal.account.name} · <Progress goal={goal} />
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onClose={closeEditor} title="Цель">
        {editing && (
          <GoalForm
            goal={editing}
            onSaved={closeEditor}
            footer={<DeleteGoalButton goal={editing} onDeleted={closeEditor} />}
          />
        )}
      </Dialog>
    </Panel>
  );
}
