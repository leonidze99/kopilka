import {
  type Transaction,
  transactionTitle,
  useDeleteTransactionMutation,
} from '@/entities/transaction';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DeleteTransactionButtonProps {
  transaction: Transaction;
  onDeleted?: () => void;
}

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
        label={`Удалить операцию «${transactionTitle(transaction)}»`}
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
