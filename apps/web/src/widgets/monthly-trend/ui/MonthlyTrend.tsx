import { ChartColumn } from 'lucide-react';
import { useState } from 'react';
import {
  type MonthlyTotal,
  useMonthlyTotalsQuery,
} from '@/entities/transaction';
import { useBaseCurrency } from '@/entities/session';
import {
  errorMessage,
  formatMoney,
  formatMonthShort,
  formatMonthTitle,
  type Month,
  shiftMonth,
} from '@/shared/lib';
import { EmptyState, FormError, Panel, Skeleton } from '@/shared/ui';
import styles from './MonthlyTrend.module.css';

/** The selected month and the eleven before it. */
const MONTHS = 12;

const compact = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * A round top for the axis and its ticks: 1, 2, 2.5 or 5 times a power of
 * ten per step, three steps. Number() is display only.
 */
function axis(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 3;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
}

interface MonthlyTrendProps {
  month: Month;
  onSelect: (month: Month) => void;
}

/** Income and expense of the year up to `month`; a click picks a month. */
export function MonthlyTrend({ month, onSelect }: MonthlyTrendProps) {
  const [active, setActive] = useState<number | null>(null);
  const { data, error, isFetching } = useMonthlyTotalsQuery({
    from: shiftMonth(month, -(MONTHS - 1)),
    to: month,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const legend = (
    <ul className={styles.legend} aria-label="Обозначения">
      <li>
        <span className={`${styles.key} ${styles.income}`} aria-hidden />
        Доходы
      </li>
      <li>
        <span className={`${styles.key} ${styles.expense}`} aria-hidden />
        Расходы
      </li>
    </ul>
  );

  return (
    <Panel title="Доходы и расходы за год" actions={legend}>
      <FormError message={error && errorMessage(error)} />
      {!data && !error && (
        <div aria-label="Загрузка" role="status">
          <Skeleton height={232} />
        </div>
      )}
      {data &&
        data.every((m) => m.income === '0.00' && m.expense === '0.00') && (
          <EmptyState
            icon={<ChartColumn size={22} />}
            title="За год операций нет"
          >
            Здесь появятся доходы и расходы по месяцам.
          </EmptyState>
        )}
      {data &&
        data.some((m) => m.income !== '0.00' || m.expense !== '0.00') && (
          <Chart
            months={data}
            selected={month}
            active={active}
            onActive={setActive}
            onSelect={onSelect}
            // Refetching after a write: keep the frame, dim it.
            stale={isFetching}
          />
        )}
    </Panel>
  );
}

interface ChartProps {
  months: MonthlyTotal[];
  selected: Month;
  active: number | null;
  onActive: (index: number | null) => void;
  onSelect: (month: Month) => void;
  stale: boolean;
}

function Chart({
  months,
  selected,
  active,
  onActive,
  onSelect,
  stale,
}: ChartProps) {
  const currency = useBaseCurrency();
  const ticks = axis(
    Math.max(...months.flatMap((m) => [Number(m.income), Number(m.expense)])),
  );
  const top = ticks.at(-1) ?? 1;
  const height = (amount: string) => `${(Number(amount) / top) * 100}%`;
  const shown = active === null ? undefined : months[active];

  return (
    <div className={styles.wrapper}>
      <div
        className={[styles.chart, stale && styles.stale]
          .filter(Boolean)
          .join(' ')}
        onPointerLeave={() => onActive(null)}
      >
        <div className={styles.axis} aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }}>
              {compact.format(tick)}
            </span>
          ))}
        </div>
        <div className={styles.plot}>
          <div className={styles.grid} aria-hidden>
            {ticks.map((tick) => (
              <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }} />
            ))}
          </div>
          <ol className={styles.months}>
            {months.map((item, index) => {
              const value = item.month as Month;
              return (
                <li key={item.month}>
                  <button
                    type="button"
                    className={styles.slot}
                    aria-pressed={value === selected}
                    aria-label={`${formatMonthTitle(value)}: доходы ${formatMoney(item.income, currency)}, расходы ${formatMoney(item.expense, currency)}`}
                    onPointerEnter={() => onActive(index)}
                    onFocus={() => onActive(index)}
                    onBlur={() => onActive(null)}
                    onClick={() => onSelect(value)}
                  >
                    <span className={styles.bars} aria-hidden>
                      <span
                        className={`${styles.bar} ${styles.income}`}
                        style={{ height: height(item.income) }}
                      />
                      <span
                        className={`${styles.bar} ${styles.expense}`}
                        style={{ height: height(item.expense) }}
                      />
                    </span>
                    <span className={styles.label} aria-hidden>
                      {formatMonthShort(value)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {shown && active !== null && (
            <Tooltip item={shown} index={active} count={months.length} />
          )}
        </div>
      </div>
      <details className={styles.table}>
        <summary>Показать таблицей</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Месяц</th>
              <th scope="col">Доходы</th>
              <th scope="col">Расходы</th>
              <th scope="col">Баланс</th>
            </tr>
          </thead>
          <tbody>
            {months.map((item) => (
              <tr key={item.month}>
                <th scope="row">{formatMonthTitle(item.month as Month)}</th>
                <td>{formatMoney(item.income, currency)}</td>
                <td>{formatMoney(item.expense, currency)}</td>
                <td>{formatMoney(item.balance, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Tooltip({
  item,
  index,
  count,
}: {
  item: MonthlyTotal;
  index: number;
  count: number;
}) {
  const currency = useBaseCurrency();
  // Centered over its month, but kept inside the chart at the edges.
  const shift = index < 2 ? '-15%' : index > count - 3 ? '-85%' : '-50%';
  return (
    <div
      className={styles.tooltip}
      style={{
        left: `${((index + 0.5) / count) * 100}%`,
        transform: `translateX(${shift})`,
      }}
      aria-hidden
    >
      <p className={styles.tooltipTitle}>
        {formatMonthTitle(item.month as Month)}
      </p>
      <p>
        <span className={`${styles.line} ${styles.income}`} />
        <strong>{formatMoney(item.income, currency)}</strong> доходы
      </p>
      <p>
        <span className={`${styles.line} ${styles.expense}`} />
        <strong>{formatMoney(item.expense, currency)}</strong> расходы
      </p>
      <p className={styles.tooltipBalance}>
        Баланс <strong>{formatMoney(item.balance, currency)}</strong>
      </p>
    </div>
  );
}
