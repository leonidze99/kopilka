import { CreateTransactionForm } from '@/features/transaction-create';
import { Panel } from '@/shared/ui';
import { MonthSummary } from '@/widgets/month-summary';
import { TransactionList } from '@/widgets/transaction-list';
import styles from '../../page.module.css';

export function TransactionsPage() {
  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Операции</h1>
        <p className={styles.subtitle}>Доходы и расходы за всё время</p>
      </div>
      <MonthSummary />
      <div className={styles.columns}>
        <TransactionList />
        <div className={styles.aside}>
          <Panel title="Новая операция">
            <CreateTransactionForm />
          </Panel>
        </div>
      </div>
    </div>
  );
}
