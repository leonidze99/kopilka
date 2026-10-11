import { type ComponentPropsWithRef, useId } from 'react';
import styles from '../text-field/TextField.module.css';

interface SelectFieldProps extends ComponentPropsWithRef<'select'> {
  label: string;
  error?: string;
}

/** Labelled <select> with the same look and error handling as TextField. */
export function SelectField({
  label,
  error,
  id,
  children,
  ...selectProps
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...selectProps}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
