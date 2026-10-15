import { Plus } from 'lucide-react';
import { useCreateAccountMutation } from '@/entities/account';
import { useBaseCurrency } from '@/entities/session';
import { toast } from '@/shared/ui';
import { AccountForm, type AccountFormValues } from './AccountForm';

export function CreateAccountForm() {
  const [createAccount] = useCreateAccountMutation();
  // Most accounts are in the currency the user counts in.
  const emptyValues: AccountFormValues = {
    name: '',
    type: 'card',
    currency: useBaseCurrency(),
    openingBalance: '',
    allowNegative: true,
  };

  return (
    <AccountForm
      defaultValues={emptyValues}
      submitLabel={
        <>
          <Plus size={18} aria-hidden />
          Добавить счёт
        </>
      }
      submit={createAccount}
      onSuccess={(reset) => {
        toast('Счёт добавлен');
        reset(emptyValues);
      }}
    />
  );
}
