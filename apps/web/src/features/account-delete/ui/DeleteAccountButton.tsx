import { type Account, useDeleteAccountMutation } from '@/entities/account';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DeleteAccountButtonProps {
  account: Account;
  onDeleted?: () => void;
}

export function DeleteAccountButton({
  account,
  onDeleted,
}: DeleteAccountButtonProps) {
  const [deleteAccount, { isLoading, error }] = useDeleteAccountMutation();

  return (
    <>
      <ConfirmButton
        look="text"
        label={`Удалить счёт «${account.name}»`}
        loading={isLoading}
        onConfirm={async () => {
          const result = await deleteAccount(account.id);
          if (result.error) return;
          toast('Счёт удалён');
          onDeleted?.();
        }}
      />
      {/* e.g. ACCOUNT_IN_USE: the account still has transactions. */}
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
