import {
  type Transaction,
  useDeleteTransactionMutation,
} from '@/entities/transaction';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DeleteTransactionButtonProps {
  transaction: Transaction;
  onDeleted?: () => void;
}

const titleOf = (transaction: Transaction) =>
  transaction.type === 'transfer' ? 'Перевод' : transaction.category.name;

export function DeleteTransactionButton({
  transaction,
  onDeleted,
}: DeleteTransactionButtonProps) {
  const [deleteTransaction, { isLoading, error }] =
    useDeleteTransactionMutation();
  return (
    <>
      <ConfirmButton
        look="text"
        label={`Удалить операцию «${titleOf(transaction)}»`}
        loading={isLoading}
        onConfirm={async () => {
          const result = await deleteTransaction(transaction.id);
          if (result.error) return;
          toast('Операция удалена');
          onDeleted?.();
        }}
      />
      {/* e.g. INSUFFICIENT_FUNDS: the balance relies on this income. */}
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
