import { Plus } from 'lucide-react';
import { useCreateTransactionMutation } from '@/entities/transaction';
import { toDateTimeLocal } from '@/shared/lib';
import { toast } from '@/shared/ui';
import { TransactionForm, type TransactionFormValues } from './TransactionForm';

const emptyValues = (
  keep: Partial<TransactionFormValues> = {},
): TransactionFormValues => ({
  type: 'expense',
  categoryId: '',
  accountId: '',
  toAccountId: '',
  amount: '',
  // Local time: <input type="datetime-local"> has no time zone.
  occurredAt: toDateTimeLocal(new Date()),
  comment: '',
  ...keep,
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
        toast(
          values.type === 'transfer'
            ? 'Перевод сохранён'
            : 'Операция добавлена',
        );
        // Keep type, category and accounts: entries of a kind come in a row.
        reset(
          emptyValues({
            type: values.type,
            accountId: values.accountId,
            ...(values.type === 'transfer'
              ? { toAccountId: values.toAccountId }
              : { categoryId: values.categoryId }),
          }),
        );
        onCreated?.();
      }}
    />
  );
}
