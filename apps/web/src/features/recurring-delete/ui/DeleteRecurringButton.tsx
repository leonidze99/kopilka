import {
  type RecurringRule,
  useDeleteRecurringMutation,
} from '@/entities/recurring';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DeleteRecurringButtonProps {
  rule: RecurringRule;
  onDeleted?: () => void;
}

export function DeleteRecurringButton({
  rule,
  onDeleted,
}: DeleteRecurringButtonProps) {
  const [deleteRecurring, { isLoading, error }] = useDeleteRecurringMutation();
  const title = rule.type === 'transfer' ? 'Перевод' : rule.category.name;

  return (
    <>
      <ConfirmButton
        look="text"
        label={`Удалить регулярную операцию «${title}»`}
        loading={isLoading}
        onConfirm={async () => {
          const result = await deleteRecurring(rule.id);
          if (result.error) return;
          // The transactions it made stay: say so.
          toast('Регулярная операция удалена, сделанные операции остались');
          onDeleted?.();
        }}
      />
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
