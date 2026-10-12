import { ChevronRight, FileSpreadsheet, History } from 'lucide-react';
import { Link } from 'react-router';
import {
  IMPORT_STATUS_LABELS,
  type ImportSummary,
  OPERATIONS,
  useListImportsQuery,
} from '@/entities/import';
import { errorMessage, formatDay, formatTime, pluralize } from '@/shared/lib';
import { EmptyState, FormError, Panel, Skeleton } from '@/shared/ui';
import styles from './ImportHistory.module.css';

/** What came of an import, in a few words. */
function outcome({ status, counts }: ImportSummary): string {
  if (status !== 'done') return IMPORT_STATUS_LABELS[status];
  const imported = `Добавлено ${pluralize(counts.imported, OPERATIONS)}`;
  return counts.duplicate > 0
    ? `${imported}, ${counts.duplicate.toLocaleString('ru-RU')} уже были`
    : imported;
}

/** Recent imports; an unfinished one continues where it stopped. */
export function ImportHistory() {
  const { data: imports = [], isLoading, error } = useListImportsQuery();

  return (
    <Panel title="Последние импорты">
      <FormError message={error && errorMessage(error)} />
      {isLoading && (
        <div className={styles.skeletons} aria-label="Загрузка" role="status">
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      )}
      {!isLoading && !error && imports.length === 0 && (
        <EmptyState icon={<History size={22} />} title="Импортов ещё не было">
          Загрузите выписку банка — операции из неё появятся в ленте.
        </EmptyState>
      )}
      <ul className={styles.list}>
        {imports.map((item) => (
          <li key={item.id}>
            <Link to={`/import/${item.id}`} className={styles.item}>
              <span className={styles.icon} aria-hidden>
                <FileSpreadsheet size={20} />
              </span>
              <span className={styles.main}>
                <span className={styles.name}>{item.fileName}</span>
                <span className={styles.meta}>
                  {formatDay(item.createdAt)}, {formatTime(item.createdAt)}
                  {item.account && ` · ${item.account.name}`}
                </span>
              </span>
              <span
                className={[
                  styles.status,
                  item.status !== 'done' && styles.pending,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {outcome(item)}
              </span>
              <ChevronRight className={styles.chevron} size={18} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
