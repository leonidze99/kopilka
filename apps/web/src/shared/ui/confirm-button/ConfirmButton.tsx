import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../button/Button';

interface ConfirmButtonProps {
  /** What is being removed, for screen readers: "Удалить «Кафе»". */
  label: string;
  onConfirm: () => void;
  loading?: boolean;
}

const RESET_AFTER_MS = 4000;

/**
 * Two-step delete: the first click asks, the second one acts. Unlike
 * window.confirm() it does not block the page and is easy to test.
 * At rest it is a trash icon; armed, it says what the next click does.
 */
export function ConfirmButton({
  label,
  onConfirm,
  loading,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), RESET_AFTER_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      variant={armed ? 'danger' : 'ghost'}
      size={armed ? 'sm' : 'icon'}
      loading={loading}
      aria-label={armed ? `Подтвердите: ${label}` : label}
      title={armed ? undefined : label}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? 'Удалить?' : <Trash2 size={17} aria-hidden />}
    </Button>
  );
}
