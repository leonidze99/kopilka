import { CircleCheck, X } from 'lucide-react';
import { useEffect } from 'react';
import { clearToasts, dismissToast, useToasts } from './toast';
import styles from './Toaster.module.css';

/** Where toasts show up; render it once per layout. */
export function Toaster() {
  const toasts = useToasts();

  // Toasts belong to the page that showed them, not to the next one.
  useEffect(() => clearToasts, []);

  return (
    <section
      className={styles.region}
      aria-label="Уведомления"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast}>
          <CircleCheck className={styles.icon} size={18} aria-hidden />
          <span className={styles.message}>{toast.message}</span>
          <button
            type="button"
            className={styles.close}
            aria-label="Скрыть уведомление"
            onClick={() => dismissToast(toast.id)}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}
    </section>
  );
}
