import { useMemo } from 'react';
import { useTransactionSummaryQuery } from '@/entities/transaction';
import {
  errorMessage,
  formatMoney,
  formatMonth,
  monthRange,
} from '@/shared/lib';
import { FormError, Panel } from '@/shared/ui';
import styles from './MonthSummary.module.css';

/** Income, expense and balance of the current month, summed by the API. */
export function MonthSummary() {
  const range = useMemo(() => monthRange(), []);
  const { data, error } = useTransactionSummaryQuery({
    from: range.from.toISOString(),
    to: range.to.toISOString(),
  });

  return (
    <Panel title={`Итоги: ${formatMonth(range.from)}`}>
      {error ? (
        <FormError message={errorMessage(error)} />
      ) : (
        <dl className={styles.stats}>
          <div>
            <dt>Доходы</dt>
            <dd className={styles.income}>
              {data ? formatMoney(data.income) : '…'}
            </dd>
          </div>
          <div>
            <dt>Расходы</dt>
            <dd className={styles.expense}>
              {data ? formatMoney(data.expense) : '…'}
            </dd>
          </div>
          <div>
            <dt>Баланс</dt>
            <dd>{data ? formatMoney(data.balance) : '…'}</dd>
          </div>
        </dl>
      )}
    </Panel>
  );
}
