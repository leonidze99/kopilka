import { Plus } from 'lucide-react';
import { useCreateTransactionMutation } from '@/entities/transaction';
import { toDateTimeLocal } from '@/shared/lib';
import { toast } from '@/shared/ui';
import { usePendingReceipts } from './PendingReceipts';
import { TransactionForm, type TransactionFormValues } from './TransactionForm';

const emptyValues = (
  keep: Partial<TransactionFormValues> = {},
): TransactionFormValues => ({
  type: 'expense',
  categoryId: '',
  accountId: '',
  toAccountId: '',
  amount: '',
  toAmount: '',
  baseAmount: '',
  // Local time: <input type="datetime-local"> has no time zone.
  occurredAt: toDateTimeLocal(new Date()),
  comment: '',
  tags: [],
  splits: [],
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
  const receipts = usePendingReceipts();

  return (
    <TransactionForm
      defaultValues={emptyValues()}
      submitLabel={
        <>
          <Plus size={18} aria-hidden />
          Добавить операцию
        </>
      }
      attachments={receipts.render}
      submit={async (values) => {
        receipts.clearError();
        const result = await createTransaction({
          ...values,
          occurredAt: values.occurredAt.toISOString(),
        });
        // The photos need the id: they go up once the transaction exists,
        // while the submit button still spins.
        if (result.data) await receipts.send(result.data.id);
        return result;
      }}
      onSuccess={(values, reset) => {
        toast(
          values.type === 'transfer'
            ? 'Перевод сохранён'
            : 'Операция добавлена',
        );
        // Keep type, category, accounts and tags: entries of a kind come in a row.
        reset(
          emptyValues({
            type: values.type,
            accountId: values.accountId,
            tags: values.tags,
            ...(values.type === 'transfer'
              ? { toAccountId: values.toAccountId }
              : // After a split receipt the next entry starts plain.
                { categoryId: values.categoryId ?? '' }),
          }),
        );
        onCreated?.();
      }}
    />
  );
}
