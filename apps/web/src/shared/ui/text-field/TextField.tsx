import { type ComponentPropsWithRef, type ReactNode, useId } from 'react';
import styles from './TextField.module.css';

interface TextFieldProps extends ComponentPropsWithRef<'input'> {
  label: string;
  error?: string;
  /** Shown inside the field on the right, e.g. the currency sign. */
  suffix?: ReactNode;
  /** Bigger text: for the main value of a form, such as an amount. */
  large?: boolean;
}

/** Labelled input; the error is announced and linked for screen readers. */
export function TextField({
  label,
  error,
  suffix,
  large,
  id,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          id={inputId}
          className={[styles.input, large && styles.large]
            .filter(Boolean)
            .join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {suffix && (
          <span className={styles.suffix} aria-hidden>
            {suffix}
          </span>
        )}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
