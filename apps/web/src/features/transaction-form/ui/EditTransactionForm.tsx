import type { ReactNode } from 'react';
import {
  type Transaction,
  useReplaceTransactionMutation,
} from '@/entities/transaction';
import { toDateTimeLocal } from '@/shared/lib';
import { toast } from '@/shared/ui';
import { TransactionForm } from './TransactionForm';

interface EditTransactionFormProps {
  transaction: Transaction;
  onSaved: () => void;
  /** Above the submit button: the receipt photos. */
  attachments?: ReactNode;
  footer?: ReactNode;
}

export function EditTransactionForm({
  transaction,
  onSaved,
  attachments,
  footer,
}: EditTransactionFormProps) {
  const [replaceTransaction] = useReplaceTransactionMutation();

  return (
    <TransactionForm
      defaultValues={{
        type: transaction.type,
        categoryId:
          transaction.type === 'transfer'
            ? ''
            : (transaction.category?.id ?? ''),
        accountId: transaction.account.id,
        toAccountId:
          transaction.type === 'transfer' ? transaction.toAccount.id : '',
        // "1234.50" as people write it here.
        amount: transaction.amount.replace('.', ','),
        occurredAt: toDateTimeLocal(new Date(transaction.occurredAt)),
        comment: transaction.comment ?? '',
        tags: transaction.tags.map((tag) => tag.name),
        splits:
          transaction.type === 'transfer'
            ? []
            : transaction.splits.map((split) => ({
                categoryId: split.category.id,
                amount: split.amount.replace('.', ','),
              })),
      }}
      submitLabel="Сохранить"
      submit={(values) =>
        replaceTransaction({
          id: transaction.id,
          body: { ...values, occurredAt: values.occurredAt.toISOString() },
        })
      }
      onSuccess={() => {
        toast('Изменения сохранены');
        onSaved();
      }}
      attachments={attachments}
      footer={footer}
    />
  );
}
