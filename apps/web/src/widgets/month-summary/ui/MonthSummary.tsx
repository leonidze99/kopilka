import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
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
} from '@/shared/lib';
import { FormError, Skeleton } from '@/shared/ui';
import styles from './MonthSummary.module.css';

/** Income, expense and balance of a month, summed by the API. */
export function MonthSummary({ month }: { month: Month }) {
  const { data, error } = useTransactionSummaryQuery(monthPeriod(month));

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
          </div>
          <div className={styles.tile}>
            <dt>
              <span className={`${styles.icon} ${styles.expense}`} aria-hidden>
                <ArrowUpRight size={18} />
              </span>
              Расходы
            </dt>
            <dd>{money(data?.expense, 120)}</dd>
          </div>
        </dl>
      )}
    </section>
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
