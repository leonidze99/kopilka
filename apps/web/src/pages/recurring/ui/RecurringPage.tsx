import { RecurringForm } from '@/features/recurring-form';
import { Panel } from '@/shared/ui';
import { RecurringList } from '@/widgets/recurring-list';
import styles from '../../page.module.css';

export function RecurringPage() {
  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Регулярные операции</h1>
        <p className={styles.subtitle}>
          Повторяются с выбранным периодом и записываются сами в свой день
        </p>
      </div>
      <div className={styles.columns}>
        <RecurringList />
        <div className={styles.aside}>
          <Panel title="Новая регулярная операция">
            <RecurringForm />
          </Panel>
        </div>
      </div>
    </div>
  );
}
