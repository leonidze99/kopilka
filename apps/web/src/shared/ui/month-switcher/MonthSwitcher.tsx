import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  currentMonth,
  formatMonthTitle,
  type Month,
  shiftMonth,
} from '@/shared/lib';
import styles from './MonthSwitcher.module.css';

interface MonthSwitcherProps {
  value: Month;
  onChange: (month: Month) => void;
}

/** ‹ Октябрь 2026 › plus a way back to the current month. */
export function MonthSwitcher({ value, onChange }: MonthSwitcherProps) {
  const today = currentMonth();

  return (
    <div className={styles.switcher}>
      <div className={styles.group} role="group" aria-label="Месяц">
        <button
          type="button"
          className={styles.arrow}
          aria-label="Предыдущий месяц"
          onClick={() => onChange(shiftMonth(value, -1))}
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <span className={styles.label} aria-live="polite">
          {formatMonthTitle(value)}
        </span>
        <button
          type="button"
          className={styles.arrow}
          aria-label="Следующий месяц"
          onClick={() => onChange(shiftMonth(value, 1))}
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      {value !== today && (
        <button
          type="button"
          className={styles.today}
          onClick={() => onChange(today)}
        >
          Текущий месяц
        </button>
      )}
    </div>
  );
}
