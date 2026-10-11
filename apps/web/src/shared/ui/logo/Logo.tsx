import { PiggyBank } from 'lucide-react';
import styles from './Logo.module.css';

/** The app mark and name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={[styles.logo, className].filter(Boolean).join(' ')}>
      <span className={styles.mark} aria-hidden>
        <PiggyBank size={20} strokeWidth={2.2} />
      </span>
      Копилка
    </span>
  );
}
