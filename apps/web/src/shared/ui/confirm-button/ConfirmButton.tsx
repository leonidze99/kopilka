import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../button/Button';
import styles from './ConfirmButton.module.css';

interface ConfirmButtonProps {
  /** What is being removed, for screen readers: "Удалить «Кафе»". */
  label: string;
  onConfirm: () => void;
  loading?: boolean;
  /** `icon`: a trash icon in a row; `text`: a full-width button in a dialog. */
  look?: 'icon' | 'text';
}

const RESET_AFTER_MS = 4000;

/**
 * Two-step delete: the first click asks, the second one acts. Unlike
 * window.confirm() it does not block the page and is easy to test.
 */
export function ConfirmButton({
  label,
  onConfirm,
  loading,
  look = 'icon',
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), RESET_AFTER_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const text = look === 'text';
  return (
    <Button
      type="button"
      variant={armed ? 'danger' : 'ghost'}
      size={text ? 'md' : armed ? 'sm' : 'icon'}
      className={text ? styles.text : undefined}
      loading={loading}
      aria-label={armed ? `Подтвердите: ${label}` : label}
      title={armed || text ? undefined : label}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? (
        'Точно удалить?'
      ) : text ? (
        <>
          <Trash2 size={17} aria-hidden />
          Удалить
        </>
      ) : (
        <Trash2 size={17} aria-hidden />
      )}
    </Button>
  );
}
