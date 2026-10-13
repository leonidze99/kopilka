import { type Goal, useDeleteGoalMutation } from '@/entities/goal';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DeleteGoalButtonProps {
  goal: Goal;
  onDeleted?: () => void;
}

/** Gives up the goal; the account and the money on it stay as they are. */
export function DeleteGoalButton({ goal, onDeleted }: DeleteGoalButtonProps) {
  const [deleteGoal, { isLoading, error }] = useDeleteGoalMutation();

  return (
    <>
      <ConfirmButton
        look="text"
        label={`Удалить цель «${goal.name}»`}
        loading={isLoading}
        onConfirm={async () => {
          const result = await deleteGoal(goal.id);
          if (result.error) return;
          toast('Цель удалена, деньги на счёте остались');
          onDeleted?.();
        }}
      />
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
