import { CreateTransactionForm } from '@/features/transaction-create';
import { Panel } from '@/shared/ui';
import { MonthSummary } from '@/widgets/month-summary';
import { TransactionList } from '@/widgets/transaction-list';
import styles from '../../page.module.css';

export function TransactionsPage() {
  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>Операции</h1>
      <MonthSummary />
      <Panel title="Новая операция">
        <CreateTransactionForm />
      </Panel>
      <TransactionList />
    </div>
  );
}
