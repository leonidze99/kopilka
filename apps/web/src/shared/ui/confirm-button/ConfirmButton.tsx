import { Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Button } from '../button/Button';
import styles from './ConfirmButton.module.css';

interface ConfirmButtonProps {
  /** What is being removed, for screen readers: "Удалить «Кафе»". */
  label: string;
  onConfirm: () => void;
  loading?: boolean;
  /** `icon`: a trash icon in a row; `text`: a full-width button in a dialog. */
  look?: 'icon' | 'text';
  /** For an action other than deleting: what the button says and shows. */
  text?: string;
  confirmText?: string;
  icon?: ReactNode;
}

const RESET_AFTER_MS = 4000;

/**
 * Two-step delete (or another action worth a second thought): the first
 * click asks, the second one acts. Unlike window.confirm() it does not
 * block the page and is easy to test.
 */
export function ConfirmButton({
  label,
  onConfirm,
  loading,
  look = 'icon',
  text: caption = 'Удалить',
  confirmText = 'Точно удалить?',
  icon = <Trash2 size={17} aria-hidden />,
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
        confirmText
      ) : text ? (
        <>
          {icon}
          {caption}
        </>
      ) : (
        icon
      )}
    </Button>
  );
}
