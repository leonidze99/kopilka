import {
  type Transaction,
  useDeleteTransactionMutation,
} from '@/entities/transaction';
import { ConfirmButton } from '@/shared/ui';

export function DeleteTransactionButton({
  transaction,
}: {
  transaction: Transaction;
}) {
  const [deleteTransaction, { isLoading }] = useDeleteTransactionMutation();
  return (
    <ConfirmButton
      label={`Удалить операцию «${transaction.category.name}»`}
      loading={isLoading}
      onConfirm={() => deleteTransaction(transaction.id)}
    />
  );
}
