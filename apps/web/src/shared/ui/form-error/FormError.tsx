import styles from './FormError.module.css';

/** An error about the form as a whole, e.g. wrong credentials. */
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className={styles.error} role="alert">
      {message}
    </p>
  );
}
