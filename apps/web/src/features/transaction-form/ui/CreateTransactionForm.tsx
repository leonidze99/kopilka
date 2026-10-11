import { Plus } from 'lucide-react';
import { useCreateTransactionMutation } from '@/entities/transaction';
import { toDateTimeLocal } from '@/shared/lib';
import { toast } from '@/shared/ui';
import { TransactionForm } from './TransactionForm';

const emptyValues = (categoryId = '') => ({
  categoryId,
  amount: '',
  // Local time: <input type="datetime-local"> has no time zone.
  occurredAt: toDateTimeLocal(new Date()),
  comment: '',
});

interface CreateTransactionFormProps {
  /** E.g. to close the dialog the form is in. */
  onCreated?: () => void;
}

export function CreateTransactionForm({
  onCreated,
}: CreateTransactionFormProps) {
  const [createTransaction] = useCreateTransactionMutation();

  return (
    <TransactionForm
      defaultValues={emptyValues()}
      defaultKind="expense"
      submitLabel={
        <>
          <Plus size={18} aria-hidden />
          Добавить операцию
        </>
      }
      submit={(values) =>
        createTransaction({
          ...values,
          occurredAt: values.occurredAt.toISOString(),
        })
      }
      onSuccess={(values, reset) => {
        toast('Операция добавлена');
        // Keep the category: several expenses of a kind often come in a row.
        reset(emptyValues(values.categoryId));
        onCreated?.();
      }}
    />
  );
}
