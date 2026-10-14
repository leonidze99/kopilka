import { Camera, X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Skeleton } from '@/shared/ui';
import { RECEIPT_ACCEPT } from '../lib/check-file';
import styles from './ReceiptGallery.module.css';

export interface GalleryItem {
  key: string;
  picture: ReactNode;
  /** "Фото чека 1": the tile's accessible name. */
  label: string;
  /** Opens the photo (a stored one). */
  onOpen?: () => void;
  /** Takes it off the list (one not sent yet). */
  onRemove?: () => void;
}

interface ReceiptGalleryProps {
  items: GalleryItem[];
  /** Photos on their way up, shown as placeholders. */
  pending?: number;
  /** False when the transaction has as many photos as it may. */
  canAdd: boolean;
  onAdd: (files: File[]) => void;
  error?: string;
}

/** Photos of receipts as tiles, and a tile to add more. */
export function ReceiptGallery({
  items,
  pending = 0,
  canAdd,
  onAdd,
  error,
}: ReceiptGalleryProps) {
  const inputId = useId();
  return (
    <div className={styles.gallery}>
      <span className={styles.title}>Фото чека</span>
      <ul className={styles.tiles} aria-label="Фото чека">
        {items.map((item) => (
          <li key={item.key} className={styles.tile}>
            {item.onOpen ? (
              <button
                type="button"
                className={styles.open}
                aria-label={item.label}
                onClick={item.onOpen}
              >
                {item.picture}
              </button>
            ) : (
              <span className={styles.open}>{item.picture}</span>
            )}
            {item.onRemove && (
              <button
                type="button"
                className={styles.remove}
                aria-label={`Убрать: ${item.label}`}
                onClick={item.onRemove}
              >
                <X size={12} aria-hidden />
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: pending }, (_, index) => (
          <li key={`pending-${index}`} className={styles.tile}>
            <Skeleton width="100%" height="100%" radius={8} />
          </li>
        ))}
        {canAdd && (
          <li className={styles.tile}>
            {/* A label, not a button: it opens the file picker by itself,
                and on a phone that picker offers the camera. */}
            <label htmlFor={inputId} className={styles.add}>
              <Camera size={18} aria-hidden />
              <span>Добавить</span>
            </label>
            <input
              id={inputId}
              className="visually-hidden"
              type="file"
              accept={RECEIPT_ACCEPT}
              multiple
              aria-label="Добавить фото чека"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                // The same photo may be picked again after a failure.
                event.target.value = '';
                if (files.length) onAdd(files);
              }}
            />
          </li>
        )}
      </ul>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
