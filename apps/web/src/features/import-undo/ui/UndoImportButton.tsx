import { Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OPERATIONS, useUndoImportMutation } from '@/entities/import';
import { errorMessage, pluralize } from '@/shared/lib';
import { Button, FormError, toast } from '@/shared/ui';

const RESET_AFTER_MS = 4000;

interface UndoImportButtonProps {
  importId: string;
  /** How many transactions it made: said before they go. */
  count: number;
}

/**
 * Two steps, like deleting: the first click says how many transactions
 * will go, the second deletes them.
 */
export function UndoImportButton({ importId, count }: UndoImportButtonProps) {
  const [undo, { isLoading, error }] = useUndoImportMutation();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), RESET_AFTER_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <>
      <Button
        variant={armed ? 'danger' : 'ghost'}
        loading={isLoading}
        onClick={async () => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          const result = await undo(importId);
          if (!result.error) toast('Операции импорта удалены');
        }}
      >
        <Undo2 size={17} aria-hidden />
        {armed ? `Удалить ${pluralize(count, OPERATIONS)}?` : 'Отменить импорт'}
      </Button>
      {/* e.g. INSUFFICIENT_FUNDS: the API names the account. */}
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
