import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './Chip.module.css';

interface ChipProps {
  children: ReactNode;
  /** A button then: e.g. opens what the chip stands for. */
  onClick?: () => void;
  /** With `onRemove`: a remove button, labelled with this text. */
  removeLabel?: string;
  onRemove?: () => void;
}

/** A small rounded label: a tag on a transaction, in a field, in a list. */
export function Chip({ children, onClick, removeLabel, onRemove }: ChipProps) {
  if (onClick) {
    return (
      <button
        type="button"
        className={`${styles.chip} ${styles.clickable}`}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }
  return (
    <span className={styles.chip}>
      {children}
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={removeLabel}
          onClick={onRemove}
        >
          <X size={12} aria-hidden />
        </button>
      )}
    </span>
  );
}
