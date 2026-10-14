import { Hash } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import {
  KIND_OPTIONS,
  KIND_TITLES,
  type TransactionKind,
} from '@/entities/category';
import { useListTagsQuery } from '@/entities/tag';
import {
  type TagTotal,
  useTagTotalsQuery,
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
import styles from './TagBreakdown.module.css';

const KIND_TABS = KIND_OPTIONS.map(({ value }) => ({
  value,
  label: KIND_TITLES[value],
}));

interface TagBreakdownProps {
  month: Month;
  /** The tag the list below is narrowed to, if any. */
  selectedId?: string;
  onSelect: (tagId: string | undefined) => void;
}

/**
 * What the tags of a month came to. Unlike categories, tags overlap — a
 * transaction with two tags counts in both — so each tag gets its own bar
 * against the month's total rather than a part of one split bar. Not shown
 * at all until the user has a tag.
 */
export function TagBreakdown({
  month,
  selectedId,
  onSelect,
}: TagBreakdownProps) {
  const [kind, setKind] = useState<TransactionKind>('expense');
  const { data: tags } = useListTagsQuery();
  const period = monthPeriod(month);
  const hasTags = !!tags && tags.length > 0;
  const totals = useTagTotalsQuery({ ...period, kind }, { skip: !hasTags });
  // The same request the summary card makes: served from the cache.
  const summary = useTransactionSummaryQuery(period, { skip: !hasTags });

  if (!hasTags) return null;

  const grandTotal = summary.data && Number(summary.data[kind]);
  const share = (item: TagTotal) =>
    grandTotal ? (Number(item.total) / grandTotal) * 100 : 0;
  const items = totals.data ?? [];
  const error = totals.error ?? summary.error;
  const loading = !error && (totals.isFetching || summary.isLoading);

  return (
    <Panel
      title="По тегам"
      actions={
        <Segmented
          label="Что показать по тегам"
          options={KIND_TABS}
          value={kind}
          onChange={setKind}
        />
      }
    >
      {error && <FormError message={errorMessage(error)} />}

      {loading && items.length === 0 && (
        <div className={styles.list} aria-label="Загрузка">
          {[60, 40].map((width) => (
            <Skeleton key={width} width={`${width}%`} height={32} />
          ))}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<Hash size={22} />}
          title={`В ${formatMonthIn(month)} ${kind === 'expense' ? 'расходов' : 'доходов'} с тегами нет`}
        />
      )}

      {items.length > 0 && grandTotal !== undefined && (
        <ul
          className={styles.list}
          aria-label={`${KIND_TITLES[kind]} по тегам`}
          aria-busy={loading}
        >
          {items.map((item) => (
            <li key={item.tag.id}>
              <TagRow
                item={item}
                share={share(item)}
                selected={selectedId === item.tag.id}
                onClick={() =>
                  onSelect(selectedId === item.tag.id ? undefined : item.tag.id)
                }
              />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

const percent = (share: number) =>
  share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`;

function TagRow({
  item,
  share,
  selected,
  onClick,
}: {
  item: TagTotal;
  share: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.row}
      aria-pressed={selected}
      title={selected ? 'Показать все операции' : 'Показать операции с тегом'}
      onClick={onClick}
    >
      <span className={styles.name}>
        <Hash size={14} aria-hidden />
        {item.tag.name}
      </span>
      <span className={styles.percent}>{percent(share)}</span>
      <span className={styles.amount}>{formatMoney(item.total)}</span>
      {/* The share as a bar; the percent before it says the same. */}
      <span className={styles.track} aria-hidden>
        <span
          className={styles.fill}
          style={{ '--width': `${Math.min(share, 100)}%` } as CSSProperties}
        />
      </span>
    </button>
  );
}
