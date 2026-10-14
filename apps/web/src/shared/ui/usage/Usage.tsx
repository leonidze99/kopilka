import type { CSSProperties } from 'react';
import { formatMoney } from '@/shared/lib';
import styles from './Usage.module.css';

/** Close to the limit: the bar warns before it is crossed. */
const WARN_AT = 0.85;

interface UsageBarProps {
  /** Decimal strings from the API: the bar is display only. */
  spent: string;
  limit: string;
}

/**
 * How much of a limit is used: green, orange from 85%, red past it.
 * Hidden from screen readers — the amounts next to it say the same.
 */
export function UsageBar({ spent, limit }: UsageBarProps) {
  const share = Number(spent) / Number(limit);
  const tone = share > 1 ? 'over' : share >= WARN_AT ? 'warn' : 'ok';
  return (
    <span className={styles.track} aria-hidden>
      <span
        className={`${styles.fill} ${styles[tone]}`}
        style={{ '--width': `${Math.min(share, 1) * 100}%` } as CSSProperties}
      />
    </span>
  );
}

/** "Осталось N", or "Перерасход N" in red when `remaining` is negative. */
export function UsageRemaining({ remaining }: { remaining: string }) {
  const over = remaining.startsWith('-');
  return (
    <span className={over ? styles.overspent : styles.left}>
      {over
        ? `Перерасход ${formatMoney(remaining.slice(1))}`
        : `Осталось ${formatMoney(remaining)}`}
    </span>
  );
}
