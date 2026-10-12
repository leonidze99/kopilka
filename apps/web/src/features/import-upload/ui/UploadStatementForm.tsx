import { FileUp } from 'lucide-react';
import { type DragEvent, useId, useState } from 'react';
import { type Import, useUploadImportMutation } from '@/entities/import';
import { errorMessage, toApiError } from '@/shared/lib';
import { FormError } from '@/shared/ui';
import styles from './UploadStatementForm.module.css';

interface UploadStatementFormProps {
  onUploaded: (imported: Import) => void;
}

/**
 * A file goes up as soon as it is chosen or dropped: there is nothing else
 * to fill in before the server has read its header.
 */
export function UploadStatementForm({ onUploaded }: UploadStatementFormProps) {
  const inputId = useId();
  const [upload, { isLoading, error, reset }] = useUploadImportMutation();
  const [dragging, setDragging] = useState(false);

  const send = async (file: File | undefined) => {
    if (!file || isLoading) return;
    reset();
    const result = await upload(file);
    if (result.data) onUploaded(result.data);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void send(event.dataTransfer.files[0]);
  };

  // "Файл больше 10 МБ", "Не удалось прочитать CSV (строка 3)": the API
  // explains what is wrong with the file itself.
  const message =
    error &&
    (toApiError(error)?.details?.find((detail) => detail.field === 'file')
      ?.message ??
      errorMessage(error));

  return (
    <div className={styles.upload}>
      <label
        htmlFor={inputId}
        className={[styles.zone, dragging && styles.dragging]
          .filter(Boolean)
          .join(' ')}
        aria-busy={isLoading || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <span className={styles.icon} aria-hidden>
          {isLoading ? (
            <span className={styles.spinner} />
          ) : (
            <FileUp size={24} />
          )}
        </span>
        <span className={styles.title}>
          {isLoading ? 'Загружаем файл…' : 'Выберите файл выписки'}
        </span>
        <span className={styles.hint}>
          CSV до 10 МБ, или перетащите его сюда
        </span>
      </label>
      <input
        id={inputId}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        disabled={isLoading}
        onChange={(event) => {
          void send(event.target.files?.[0]);
          // The same file can be chosen again after an error.
          event.target.value = '';
        }}
      />
      <FormError message={message} />
    </div>
  );
}
