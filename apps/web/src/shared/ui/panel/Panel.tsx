import { type ReactNode, useId } from 'react';
import styles from './Panel.module.css';

interface PanelProps {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A titled surface for a block of a page. The title names the section:
 * screen readers list it among the page's regions.
 */
export function Panel({ title, actions, children }: PanelProps) {
  const titleId = useId();
  return (
    <section
      className={styles.panel}
      aria-labelledby={title ? titleId : undefined}
    >
      {(title || actions) && (
        <header className={styles.header}>
          {title && (
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
          )}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
