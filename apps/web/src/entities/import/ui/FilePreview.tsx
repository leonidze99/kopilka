import type { Import } from '../api/import-api';
import { columnName } from '../lib/labels';
import styles from './FilePreview.module.css';

interface FilePreviewProps {
  imported: Pick<Import, 'headers' | 'sample' | 'fileName'>;
  /** What each chosen column is, by its index: "Дата", "Сумма". */
  roles?: Map<number, string>;
}

/**
 * The first rows of the file as uploaded, so the user sees which column
 * holds what. Scrolls sideways on its own: statements have many columns.
 */
export function FilePreview({ imported, roles }: FilePreviewProps) {
  const { headers, sample } = imported;
  return (
    <div
      className={styles.scroller}
      // Focusable: keyboard users can scroll it too.
      tabIndex={0}
      role="region"
      aria-label={`Начало файла ${imported.fileName}`}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((_, index) => {
              const role = roles?.get(index);
              return (
                <th
                  key={index}
                  scope="col"
                  className={role ? styles.chosen : undefined}
                >
                  <span className={styles.role}>{role ?? ' '}</span>
                  {columnName(headers, index)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sample.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {headers.map((_, index) => (
                <td
                  key={index}
                  className={roles?.has(index) ? styles.chosen : undefined}
                >
                  {row[index] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
