import type { ReactNode } from 'react';
import { Logo } from '../logo/Logo';
import styles from './CenteredCard.module.css';

interface CenteredCardProps {
  title: string;
  /** A line under the title. */
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function CenteredCard({
  title,
  subtitle,
  children,
  footer,
}: CenteredCardProps) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <Logo className={styles.logo} />
        <section className={styles.card} aria-labelledby="card-title">
          <h1 id="card-title" className={styles.title}>
            {title}
          </h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {children}
        </section>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </main>
  );
}
