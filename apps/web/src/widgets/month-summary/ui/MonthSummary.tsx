import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useMemo } from 'react';
import {
  type TransactionSummary,
  useTransactionSummaryQuery,
} from '@/entities/transaction';
import {
  errorMessage,
  formatMoney,
  formatMonth,
  monthRange,
} from '@/shared/lib';
import { FormError } from '@/shared/ui';
import styles from './MonthSummary.module.css';

/** Income, expense and balance of the current month, summed by the API. */
export function MonthSummary() {
  const range = useMemo(() => monthRange(), []);
  const { data, error } = useTransactionSummaryQuery({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });
  const month = formatMonth(range.from);

  return (
    <section className={styles.hero} aria-labelledby="month-summary-title">
      <h2 id="month-summary-title" className={styles.month}>
        {month.charAt(0).toUpperCase() + month.slice(1)}
      </h2>
      {error ? (
        <FormError message={errorMessage(error)} />
      ) : (
        <dl className={styles.stats}>
          <div className={styles.balance}>
            <dt>Баланс</dt>
            <dd>{data ? formatMoney(data.balance) : '…'}</dd>
            {data && <SpentBar summary={data} />}
          </div>
          <div className={styles.tile}>
            <dt>
              <span className={`${styles.icon} ${styles.income}`} aria-hidden>
                <ArrowDownLeft size={18} />
              </span>
              Доходы
            </dt>
            <dd>{data ? formatMoney(data.income) : '…'}</dd>
          </div>
          <div className={styles.tile}>
            <dt>
              <span className={`${styles.icon} ${styles.expense}`} aria-hidden>
                <ArrowUpRight size={18} />
              </span>
              Расходы
            </dt>
            <dd>{data ? formatMoney(data.expense) : '…'}</dd>
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
