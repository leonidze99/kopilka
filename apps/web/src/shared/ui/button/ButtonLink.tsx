import { Link, type LinkProps } from 'react-router';
import styles from './Button.module.css';

interface ButtonLinkProps extends LinkProps {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'md' | 'sm';
}

/** Navigation that looks like a Button: a link, not a button with a handler. */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={[styles.button, styles[variant], styles[size], className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
