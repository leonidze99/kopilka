import { Upload } from 'lucide-react';
import { CreateAccountForm } from '@/features/account-form';
import { ButtonLink, Panel } from '@/shared/ui';
import { AccountList } from '@/widgets/account-list';
import styles from '../../page.module.css';

export function AccountsPage() {
  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Счета</h1>
          <p className={styles.subtitle}>
            Где лежат деньги: карты, наличные, накопления
          </p>
        </div>
        <ButtonLink to="/import">
          <Upload size={18} aria-hidden />
          Импорт выписки
        </ButtonLink>
      </div>
      <div className={styles.columns}>
        <AccountList />
        <div className={styles.aside}>
          <Panel title="Новый счёт">
            <CreateAccountForm />
          </Panel>
        </div>
      </div>
    </div>
  );
}
