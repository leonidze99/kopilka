import { ChartPie } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import {
  KIND_OPTIONS,
  KIND_TITLES,
  type TransactionKind,
  useCategoryColor,
} from '@/entities/category';
import {
  type CategoryTotal,
  useCategoryTotalsQuery,
  useTransactionSummaryQuery,
} from '@/entities/transaction';
import {
  errorMessage,
  formatMoney,
  formatMonthIn,
  type Month,
  monthPeriod,
} from '@/shared/lib';
import { EmptyState, FormError, Panel, Segmented, Skeleton } from '@/shared/ui';
import styles from './CategoryBreakdown.module.css';

const KIND_TABS = KIND_OPTIONS.map(({ value }) => ({
  value,
  label: KIND_TITLES[value],
}));

interface CategoryBreakdownProps {
  month: Month;
  /** The category the list below is narrowed to, if any. */
  selectedId?: string;
  onSelect: (categoryId: string | undefined) => void;
}

/**
 * Where the money of a month went: one bar split into categories (part of
 * a whole) and a legend that names every part. Totals are summed by the
 * API; the shares here are for display only.
 */
export function CategoryBreakdown({
  month,
  selectedId,
  onSelect,
}: CategoryBreakdownProps) {
  const [kind, setKind] = useState<TransactionKind>('expense');
  // Hovering a segment highlights its legend row and the other way round.
  const [hovered, setHovered] = useState<string>();
  const period = monthPeriod(month);
  const totals = useCategoryTotalsQuery({ ...period, kind });
  // The same request the summary card makes: served from the cache.
  const summary = useTransactionSummaryQuery(period);

  const grandTotal = summary.data && Number(summary.data[kind]);
  const share = (item: CategoryTotal) =>
    grandTotal ? (Number(item.total) / grandTotal) * 100 : 0;
  const items = totals.data ?? [];
  const error = totals.error ?? summary.error;
  const loading = !error && (totals.isFetching || summary.isLoading);

  return (
    <Panel
      title="По категориям"
      actions={
        <Segmented
          label="Что показать"
          options={KIND_TABS}
          value={kind}
          onChange={setKind}
        />
      }
    >
      {error && <FormError message={errorMessage(error)} />}

      {loading && items.length === 0 && <BreakdownSkeleton />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<ChartPie size={22} />}
          title={`В ${formatMonthIn(month)} ${kind === 'expense' ? 'расходов' : 'доходов'} нет`}
        />
      )}

      {items.length > 0 && grandTotal !== undefined && (
        <div className={styles.chart} aria-busy={loading}>
          {/* The legend below carries the same numbers as text. */}
          <div className={styles.bar} aria-hidden>
            {items.map((item) => (
              <Segment
                key={item.category.id}
                item={item}
                share={share(item)}
                dimmed={
                  (hovered !== undefined && hovered !== item.category.id) ||
                  (selectedId !== undefined && selectedId !== item.category.id)
                }
                onHover={setHovered}
              />
            ))}
          </div>

          <ul className={styles.legend} aria-label={KIND_TITLES[kind]}>
            {items.map((item) => (
              <LegendRow
                key={item.category.id}
                item={item}
                share={share(item)}
                selected={selectedId === item.category.id}
                highlighted={hovered === item.category.id}
                onHover={setHovered}
                onClick={() =>
                  onSelect(
                    selectedId === item.category.id
                      ? undefined
                      : item.category.id,
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

const percent = (share: number) =>
  share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;

interface PartProps {
  item: CategoryTotal;
  share: number;
  onHover: (id: string | undefined) => void;
}

function Segment({
  item,
  share,
  dimmed,
  onHover,
}: PartProps & { dimmed: boolean }) {
  const color = useCategoryColor(item.category);
  return (
    <span
      className={[styles.segment, dimmed && styles.dimmed]
        .filter(Boolean)
        .join(' ')}
      style={{ flexGrow: share, '--color': color } as CSSProperties}
      title={`${item.category.name}: ${formatMoney(item.total)}, ${percent(share)}`}
      onMouseEnter={() => onHover(item.category.id)}
      onMouseLeave={() => onHover(undefined)}
    />
  );
}

function LegendRow({
  item,
  share,
  selected,
  highlighted,
  onHover,
  onClick,
}: PartProps & {
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
}) {
  const color = useCategoryColor(item.category);
  return (
    <li>
      <button
        type="button"
        className={[styles.row, highlighted && styles.highlighted]
          .filter(Boolean)
          .join(' ')}
        style={{ '--color': color } as CSSProperties}
        aria-pressed={selected}
        title={
          selected ? 'Показать все операции' : 'Показать операции категории'
        }
        onMouseEnter={() => onHover(item.category.id)}
        onMouseLeave={() => onHover(undefined)}
        onClick={onClick}
      >
        <span className={styles.swatch} aria-hidden />
        <span className={styles.name}>{item.category.name}</span>
        <span className={styles.percent}>{percent(share)}</span>
        <span className={styles.amount}>{formatMoney(item.total)}</span>
      </button>
    </li>
  );
}

function BreakdownSkeleton() {
  return (
    <div className={styles.chart} aria-label="Загрузка">
      <Skeleton height={12} radius={6} />
      <div className={styles.skeletonRows}>
        {[60, 45, 70, 35].map((width) => (
          <div key={width} className={styles.skeletonRow}>
            <Skeleton width={12} height={12} radius={4} />
            <Skeleton width={`${width}%`} />
          </div>
        ))}
      </div>
    </div>
  );
}
