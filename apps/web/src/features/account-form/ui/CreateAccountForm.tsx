import { Plus } from 'lucide-react';
import { useCreateAccountMutation } from '@/entities/account';
import { toast } from '@/shared/ui';
import { AccountForm, type AccountFormValues } from './AccountForm';

const emptyValues: AccountFormValues = {
  name: '',
  type: 'card',
  openingBalance: '',
  allowNegative: true,
};

export function CreateAccountForm() {
  const [createAccount] = useCreateAccountMutation();

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
