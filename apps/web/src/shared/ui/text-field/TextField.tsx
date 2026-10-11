import { type ComponentPropsWithRef, useId } from 'react';
import styles from './TextField.module.css';

interface TextFieldProps extends ComponentPropsWithRef<'input'> {
  label: string;
  error?: string;
}

/** Labelled input; the error is announced and linked for screen readers. */
export function TextField({ label, error, id, ...inputProps }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
