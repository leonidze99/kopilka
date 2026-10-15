import type { ReactNode } from 'react';
import { type Account, useUpdateAccountMutation } from '@/entities/account';
import { toast } from '@/shared/ui';
import { AccountForm } from './AccountForm';

interface EditAccountFormProps {
  account: Account;
  onSaved: () => void;
  footer?: ReactNode;
}

export function EditAccountForm({
  account,
  onSaved,
  footer,
}: EditAccountFormProps) {
  const [updateAccount] = useUpdateAccountMutation();

  return (
    <AccountForm
      defaultValues={{
        name: account.name,
        type: account.type,
        // "1500.00" as people write it here.
        currency: account.currency,
        openingBalance: account.openingBalance.replace('.', ','),
        allowNegative: account.allowNegative,
      }}
      submitLabel="Сохранить"
      submit={(values) => updateAccount({ id: account.id, ...values })}
      onSuccess={() => {
        toast('Изменения сохранены');
        onSaved();
      }}
      footer={footer}
    />
  );
}
