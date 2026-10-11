import type { ReactNode } from 'react';
import {
  type Transaction,
  useUpdateTransactionMutation,
} from '@/entities/transaction';
import { toDateTimeLocal } from '@/shared/lib';
import { toast } from '@/shared/ui';
import { TransactionForm } from './TransactionForm';

interface EditTransactionFormProps {
  transaction: Transaction;
  onSaved: () => void;
  footer?: ReactNode;
}

export function EditTransactionForm({
  transaction,
  onSaved,
  footer,
}: EditTransactionFormProps) {
  const [updateTransaction] = useUpdateTransactionMutation();

  return (
    <TransactionForm
      defaultValues={{
        categoryId: transaction.category.id,
        // "1234.50" as people write it here.
        amount: transaction.amount.replace('.', ','),
        occurredAt: toDateTimeLocal(new Date(transaction.occurredAt)),
        comment: transaction.comment ?? '',
      }}
      defaultKind={transaction.category.kind}
      submitLabel="Сохранить"
      submit={(values) =>
        updateTransaction({
          id: transaction.id,
          ...values,
          occurredAt: values.occurredAt.toISOString(),
        })
      }
      onSuccess={() => {
        toast('Изменения сохранены');
        onSaved();
      }}
      footer={footer}
    />
  );
}
