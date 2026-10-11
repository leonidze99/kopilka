import { type ComponentPropsWithRef, useId } from 'react';
import styles from './Switch.module.css';

interface SwitchProps extends Omit<ComponentPropsWithRef<'input'>, 'type'> {
  label: string;
  /** A line under the label: what turning it on does. */
  description?: string;
}

/** An on/off setting: a checkbox announced as a switch. */
export function Switch({ label, description, id, ...inputProps }: SwitchProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const labelId = `${inputId}-label`;
  const descriptionId = `${inputId}-description`;

  return (
    <label className={styles.switch} htmlFor={inputId}>
      <span className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {description && (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className={styles.input}
        // The name is the label alone; the description is read after it.
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        {...inputProps}
      />
    </label>
  );
}
