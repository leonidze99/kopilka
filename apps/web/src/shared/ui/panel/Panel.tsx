import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/** A titled surface for a block of a page. */
export function Panel({ title, actions, children }: PanelProps) {
  return (
    <section className={styles.panel}>
      {(title || actions) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
