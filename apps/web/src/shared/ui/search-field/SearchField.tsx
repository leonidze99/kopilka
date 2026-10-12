import { Search } from 'lucide-react';
import { type ComponentPropsWithRef, useId } from 'react';
import fieldStyles from '../text-field/TextField.module.css';
import styles from './SearchField.module.css';

interface SearchFieldProps extends Omit<
  ComponentPropsWithRef<'input'>,
  'type'
> {
  /** For screen readers: the placeholder is not a label. */
  label: string;
}

/** A search box: a magnifier, the browser's own clear button and Esc. */
export function SearchField({
  label,
  id,
  className,
  ...props
}: SearchFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={[fieldStyles.control, className].filter(Boolean).join(' ')}>
      <label htmlFor={inputId} className="visually-hidden">
        {label}
      </label>
      <Search className={styles.icon} size={17} aria-hidden />
      <input
        id={inputId}
        type="search"
        autoComplete="off"
        enterKeyHint="search"
        className={`${fieldStyles.input} ${styles.input}`}
        {...props}
      />
    </div>
  );
}
