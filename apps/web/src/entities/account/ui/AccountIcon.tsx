import { CreditCard, PiggyBank, Wallet } from 'lucide-react';
import type { AccountType } from '../lib/type';
import styles from './AccountIcon.module.css';

const ICONS = { card: CreditCard, cash: Wallet, savings: PiggyBank };

interface AccountIconProps {
  type: AccountType;
  size?: 'md' | 'sm';
  className?: string;
}

/** The kind of an account at a glance: card, cash or savings. */
export function AccountIcon({
  type,
  size = 'md',
  className,
}: AccountIconProps) {
  const Icon = ICONS[type];
  return (
    <span
      className={[styles.icon, styles[size], styles[type], className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <Icon size={size === 'md' ? 20 : 16} />
    </span>
  );
}
