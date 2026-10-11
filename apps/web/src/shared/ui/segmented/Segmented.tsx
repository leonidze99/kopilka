import styles from './Segmented.module.css';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Stretch over the whole width, options sharing it equally. */
  block?: boolean;
}

/** A radio group drawn as a switch: one option of a few. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  block,
}: SegmentedProps<T>) {
  return (
    <div
      className={[styles.group, block && styles.block]
        .filter(Boolean)
        .join(' ')}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            type="radio"
            className={styles.input}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
