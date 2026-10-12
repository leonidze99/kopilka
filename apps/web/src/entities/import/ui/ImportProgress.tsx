import { pluralize } from '@/shared/lib';
import type { Import } from '../api/import-api';
import { ROWS } from '../lib/labels';
import styles from './ImportProgress.module.css';

interface ImportProgressProps {
  imported: Pick<Import, 'status' | 'processed' | 'totalRows' | 'counts'>;
}

/** The background work on an import, as a bar. */
export function ImportProgress({ imported }: ImportProgressProps) {
  // Importing goes over the new rows only; parsing over all of them.
  const total =
    imported.status === 'importing' ? imported.counts.new : imported.totalRows;
  const done = Math.min(imported.processed, total);
  const label =
    imported.status === 'importing'
      ? 'Создаём операции'
      : 'Разбираем строки файла';

  return (
    <div className={styles.progress}>
      <div className={styles.text}>
        <span>{label}</span>
        <span className={styles.count}>
          {done.toLocaleString('ru-RU')} из {pluralize(total, ROWS)}
        </span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
      >
        <div
          className={styles.bar}
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
