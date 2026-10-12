import { useDeleteImportMutation } from '@/entities/import';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DiscardImportButtonProps {
  importId: string;
  fileName: string;
  onDiscarded?: () => void;
}

/** Drops an import that has not made transactions yet. */
export function DiscardImportButton({
  importId,
  fileName,
  onDiscarded,
}: DiscardImportButtonProps) {
  const [discard, { isLoading, error }] = useDeleteImportMutation();

  return (
    <>
      <ConfirmButton
        label={`Отменить импорт «${fileName}»`}
        loading={isLoading}
        onConfirm={async () => {
          const result = await discard(importId);
          if (result.error) return;
          toast('Импорт отменён');
          onDiscarded?.();
        }}
      />
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
