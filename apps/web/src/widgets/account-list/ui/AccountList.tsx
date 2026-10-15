import { Lock, Wallet } from 'lucide-react';
import { useState } from 'react';
import {
  type Account,
  ACCOUNT_TYPE_LABELS,
  AccountIcon,
  formatAccountsTotal,
  useListAccountsQuery,
} from '@/entities/account';
import { useBaseCurrency } from '@/entities/session';
import { DeleteAccountButton } from '@/features/account-delete';
import { EditAccountForm } from '@/features/account-form';
import { errorMessage, formatMoney } from '@/shared/lib';
import { Dialog, EmptyState, FormError, Panel, Skeleton } from '@/shared/ui';
import styles from './AccountList.module.css';

/** All accounts with their balances; a click opens one for editing. */
export function AccountList() {
  const { data, error, isLoading } = useListAccountsQuery();
  const baseCurrency = useBaseCurrency();
  const [editing, setEditing] = useState<Account>();
  const closeEditor = () => setEditing(undefined);

  if (error) return <FormError message={errorMessage(error)} />;

  return (
    <Panel
      title="Счета"
      actions={
        data && (
          <span className={styles.total}>
            Всего <strong>{formatAccountsTotal(data, baseCurrency)}</strong>
          </span>
        )
      }
    >
      {isLoading && <ListSkeleton />}
      {data?.items.length === 0 && (
        <EmptyState icon={<Wallet size={22} />} title="Счетов пока нет">
          Добавьте карту, наличные или вклад.
        </EmptyState>
      )}
      <ul className={styles.list}>
        {data?.items.map((account) => (
          <li key={account.id}>
            <button
              type="button"
              className={styles.item}
              aria-haspopup="dialog"
              onClick={() => setEditing(account)}
            >
              <AccountIcon type={account.type} />
              <span className={styles.main}>
                <span className={styles.name}>{account.name}</span>
                <span className={styles.meta}>
                  {ACCOUNT_TYPE_LABELS[account.type]}
                  {account.currency !== baseCurrency &&
                    ` · ${account.currency}`}
                  {!account.allowNegative && (
                    <span className={styles.badge}>
                      <Lock size={12} aria-hidden />
                      без минуса
                    </span>
                  )}
                </span>
              </span>
              <span
                className={[
                  styles.balance,
                  account.balance.startsWith('-') && styles.negative,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {formatMoney(account.balance, account.currency)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onClose={closeEditor} title="Счёт">
        {editing && (
          <EditAccountForm
            account={editing}
            onSaved={closeEditor}
            footer={
              <DeleteAccountButton account={editing} onDeleted={closeEditor} />
            }
          />
        )}
      </Dialog>
    </Panel>
  );
}

function ListSkeleton() {
  return (
    <div className={styles.skeleton} aria-label="Загрузка счетов">
      {[55, 40].map((width) => (
        <div key={width} className={styles.skeletonRow}>
          <Skeleton width={40} height={40} radius={12} />
          <Skeleton width={`${width}%`} />
        </div>
      ))}
    </div>
  );
}
