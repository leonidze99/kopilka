import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * A modal on the native <dialog>: the browser traps focus, makes the page
 * behind inert, closes on Esc and returns focus to where it was. A bottom
 * sheet on phones. The content mounts on open, so a form in it starts
 * fresh every time.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby={titleId}
      // Esc and dialog.close() both end up here.
      onClose={onClose}
      // The dialog element itself is hit only outside the panel: a backdrop click.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
    >
      {open && (
        <div className={styles.panel}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button
              type="button"
              className={styles.close}
              aria-label="Закрыть"
              onClick={() => ref.current?.close()}
            >
              <X size={20} aria-hidden />
            </button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}
