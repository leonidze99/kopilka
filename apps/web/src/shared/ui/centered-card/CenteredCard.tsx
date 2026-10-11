import type { ReactNode } from 'react';
import styles from './CenteredCard.module.css';

interface CenteredCardProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function CenteredCard({ title, children, footer }: CenteredCardProps) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="card-title">
        <h1 id="card-title" className={styles.title}>
          {title}
        </h1>
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </section>
    </main>
  );
}
