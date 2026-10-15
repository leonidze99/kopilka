import { ArrowLeftRight, CircleAlert, Repeat } from 'lucide-react';
import { useState } from 'react';
import { CategoryAvatar } from '@/entities/category';
import {
  describeSchedule,
  formatPaymentDay,
  type RecurringRule,
  useListRecurringQuery,
} from '@/entities/recurring';
import { DeleteRecurringButton } from '@/features/recurring-delete';
import { RecurringForm } from '@/features/recurring-form';
import { errorMessage, formatMoney, formatSignedMoney } from '@/shared/lib';
import { Dialog, EmptyState, FormError, Panel, Skeleton } from '@/shared/ui';
import styles from './RecurringList.module.css';

/** Monthly rules: what, when next, and why the last one was skipped. */
export function RecurringList() {
  const { data: rules, error, isLoading } = useListRecurringQuery();
  const [editing, setEditing] = useState<RecurringRule>();
  const close = () => setEditing(undefined);

  return (
    <Panel title="Каждый месяц">
      {error && <FormError message={errorMessage(error)} />}
      {isLoading && <Skeleton height={56} radius={12} />}
      {rules?.length === 0 && (
        <EmptyState icon={<Repeat size={22} />} title="Регулярных операций нет">
          Аренда, зарплата, подписки: добавьте их один раз, дальше операции
          будут появляться сами.
        </EmptyState>
      )}
      <ul className={styles.list}>
        {rules?.map((rule) => (
          <li key={rule.id}>
            <button
              type="button"
              className={styles.item}
              aria-haspopup="dialog"
              onClick={() => setEditing(rule)}
            >
              {rule.type === 'transfer' ? (
                <span className={styles.transferIcon} aria-hidden>
                  <ArrowLeftRight size={18} />
                </span>
              ) : (
                <CategoryAvatar category={rule.category} />
              )}
              <span className={styles.main}>
                <span className={styles.title}>
                  {rule.type === 'transfer' ? 'Перевод' : rule.category.name}
                  {!rule.active && (
                    <span className={styles.paused}>на паузе</span>
                  )}
                </span>
                <span className={styles.meta}>
                  {describeSchedule(rule.startOn, rule.every, rule.unit)}
                  {rule.active &&
                    ` · следующая ${formatPaymentDay(rule.nextOn)}`}
                </span>
                <span className={styles.meta}>
                  {rule.type === 'transfer'
                    ? `${rule.account.name} → ${rule.toAccount.name}`
                    : rule.account.name}
                  {rule.comment && ` · ${rule.comment}`}
                </span>
                {rule.lastError && (
                  <span className={styles.error}>
                    <CircleAlert size={14} aria-hidden />
                    Пропущена: {rule.lastError}
                  </span>
                )}
              </span>
              <span className={`${styles.amount} ${styles[rule.type]}`}>
                {rule.type === 'transfer'
                  ? formatMoney(rule.amount, rule.account.currency)
                  : formatSignedMoney(
                      rule.amount,
                      rule.type,
                      rule.account.currency,
                    )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onClose={close} title="Регулярная операция">
        {editing && (
          <RecurringForm
            rule={editing}
            onSaved={close}
            footer={<DeleteRecurringButton rule={editing} onDeleted={close} />}
          />
        )}
      </Dialog>
    </Panel>
  );
}
