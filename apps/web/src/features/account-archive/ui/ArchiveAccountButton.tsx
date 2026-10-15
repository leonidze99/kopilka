import { Archive } from 'lucide-react';
import {
  type Account,
  useArchiveAccountMutation,
  useUnarchiveAccountMutation,
} from '@/entities/account';
import { errorMessage, pluralize } from '@/shared/lib';
import { Button, ConfirmButton, FormError, toast } from '@/shared/ui';

interface ArchiveAccountButtonProps {
  account: Account;
  onDone?: () => void;
}

/**
 * To the archive and back. Archiving asks twice: it stops the account's
 * recurring payments. The API refuses an account with money on it and
 * says how much is left (ACCOUNT_NOT_EMPTY).
 */
export function ArchiveAccountButton({
  account,
  onDone,
}: ArchiveAccountButtonProps) {
  const [archive, archiving] = useArchiveAccountMutation();
  const [unarchive, unarchiving] = useUnarchiveAccountMutation();
  const error = archiving.error ?? unarchiving.error;

  return (
    <>
      {account.archivedAt === null ? (
        <ConfirmButton
          look="text"
          label="Отправить в архив"
          text="В архив"
          confirmText="Точно в архив?"
          icon={<Archive size={17} aria-hidden />}
          loading={archiving.isLoading}
          onConfirm={async () => {
            const result = await archive(account.id);
            if (!result.data) return;
            const stopped = result.data.stoppedRecurring;
            toast(
              stopped > 0
                ? `Счёт в архиве, остановлено ${pluralize(stopped, ['регулярный платёж', 'регулярных платежа', 'регулярных платежей'])}`
                : 'Счёт в архиве',
            );
            onDone?.();
          }}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          loading={unarchiving.isLoading}
          onClick={async () => {
            const result = await unarchive(account.id);
            if (result.error) return;
            toast('Счёт снова в работе');
            onDone?.();
          }}
        >
          Вернуть из архива
        </Button>
      )}
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
