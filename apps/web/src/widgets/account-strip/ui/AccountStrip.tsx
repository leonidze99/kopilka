import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { AccountIcon, useListAccountsQuery } from '@/entities/account';
import { formatMoney } from '@/shared/lib';
import { Skeleton } from '@/shared/ui';
import styles from './AccountStrip.module.css';

interface AccountStripProps {
  /** The account the list below is narrowed to, if any. */
  selectedId?: string;
  onSelect: (accountId: string | undefined) => void;
}

/** Balances of all accounts in a row; a click narrows the list to one. */
export function AccountStrip({ selectedId, onSelect }: AccountStripProps) {
  const { data, isLoading } = useListAccountsQuery();

  return (
    <section className={styles.strip} aria-label="Счета">
      {isLoading &&
        [1, 2].map((key) => (
          <Skeleton key={key} width={180} height={64} radius={14} />
        ))}
      {data && data.items.length > 1 && (
        <div className={styles.total}>
          <span className={styles.label}>Все счета</span>
          <span className={styles.amount}>{formatMoney(data.total)}</span>
        </div>
      )}
      {data?.items.map((account) => (
        <button
          key={account.id}
          type="button"
          className={styles.account}
          aria-pressed={selectedId === account.id}
          title={
            selectedId === account.id
              ? 'Показать операции всех счетов'
              : 'Показать операции счёта'
          }
          onClick={() =>
            onSelect(selectedId === account.id ? undefined : account.id)
          }
        >
          <AccountIcon type={account.type} size="sm" />
          <span className={styles.text}>
            <span className={styles.label}>{account.name}</span>
            <span className={styles.amount}>
              {formatMoney(account.balance)}
            </span>
          </span>
        </button>
      ))}
      <Link to="/accounts" className={styles.add}>
        <Plus size={16} aria-hidden />
        Счёт
      </Link>
    </section>
  );
}
