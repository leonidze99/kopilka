import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useMemo } from 'react';
import {
  type TransactionSummary,
  useTransactionSummaryQuery,
} from '@/entities/transaction';
import {
  errorMessage,
  formatMoney,
  formatMonthTitle,
  type Month,
  monthPeriod,
  previousPeriod,
} from '@/shared/lib';
import { FormError, Skeleton } from '@/shared/ui';
import styles from './MonthSummary.module.css';

/** Income, expense and balance of a month, summed by the API. */
export function MonthSummary({ month }: { month: Month }) {
  const { data, error } = useTransactionSummaryQuery(monthPeriod(month));
  // Once per month shown: "the same days so far" depends on now, and a
  // period recomputed every render would be a new query every render.
  const { label, ...previous } = useMemo(() => previousPeriod(month), [month]);
  const { data: before } = useTransactionSummaryQuery(previous);

  const money = (amount: string | undefined, width: number) =>
    amount === undefined ? (
      <Skeleton className={styles.skeleton} width={width} height="1em" />
    ) : (
      formatMoney(amount)
    );

  return (
    <section
      className={styles.hero}
      aria-labelledby="month-summary-title"
      aria-busy={!data && !error}
    >
      {/* The month is in the switcher right above: a title for screen readers. */}
      <h2 id="month-summary-title" className="visually-hidden">
        Итоги: {formatMonthTitle(month)}
      </h2>
      {error ? (
        <FormError message={errorMessage(error)} />
      ) : (
        <dl className={styles.stats}>
          <div className={styles.balance}>
            <dt>Баланс за месяц</dt>
            <dd>{money(data?.balance, 220)}</dd>
            {data && <SpentBar summary={data} />}
          </div>
          <div className={styles.tile}>
            <dt>
              <span className={`${styles.icon} ${styles.income}`} aria-hidden>
                <ArrowDownLeft size={18} />
              </span>
              Доходы
            </dt>
            <dd>{money(data?.income, 120)}</dd>
            <Change now={data?.income} before={before?.income} label={label} />
          </div>
          <div className={styles.tile}>
            <dt>
              <span className={`${styles.icon} ${styles.expense}`} aria-hidden>
                <ArrowUpRight size={18} />
              </span>
              Расходы
            </dt>
            <dd>{money(data?.expense, 120)}</dd>
            <Change
              now={data?.expense}
              before={before?.expense}
              label={label}
            />
          </div>
        </dl>
      )}
    </section>
  );
}

/**
 * "↑ 12% к сентябрю": against the previous period. Not colored: on the
 * green card, and whether up is good depends on the line. Nothing when
 * there is no base to compare with. Number() is display only.
 */
function Change({
  now,
  before,
  label,
}: {
  now: string | undefined;
  before: string | undefined;
  label: string;
}) {
  if (now === undefined || before === undefined || Number(before) <= 0) {
    return null;
  }
  const percent = Math.round((Number(now) / Number(before) - 1) * 100);
  return (
    <dd className={styles.change}>
      {percent === 0
        ? `0% к ${label}`
        : `${percent > 0 ? '↑' : '↓'} ${Math.abs(percent)}% к ${label}`}
    </dd>
  );
}

/** How much of the month's income is spent. Number() here is display only. */
function SpentBar({ summary }: { summary: TransactionSummary }) {
  const income = Number(summary.income);
  if (income <= 0) return null;
  const percent = Math.round((Number(summary.expense) / income) * 100);

  return (
    <dd className={styles.spent}>
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className={styles.spentText}>
        {percent > 100
          ? `Расходы больше доходов на ${percent - 100}%`
          : `Потрачено ${percent}% доходов`}
      </span>
    </dd>
  );
}
