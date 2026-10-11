import { ChevronDown } from 'lucide-react';
import { type ComponentPropsWithRef, useId } from 'react';
import styles from '../text-field/TextField.module.css';

interface SelectFieldProps extends ComponentPropsWithRef<'select'> {
  label: string;
  error?: string;
  /** For screen readers only, when the options speak for themselves. */
  hideLabel?: boolean;
  /** A shorter control, e.g. a filter in a panel header. */
  compact?: boolean;
}

/** Labelled <select> with the same look and error handling as TextField. */
export function SelectField({
  label,
  error,
  hideLabel,
  compact,
  id,
  children,
  ...selectProps
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={styles.field}>
      <label
        className={hideLabel ? 'visually-hidden' : styles.label}
        htmlFor={selectId}
      >
        {label}
      </label>
      <div className={styles.control}>
        <select
          id={selectId}
          className={[styles.input, compact && styles.compact]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown className={styles.chevron} size={18} aria-hidden />
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
