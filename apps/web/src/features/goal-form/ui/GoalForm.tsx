import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { goalInputSchema } from '@kopilka/shared';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useListAccountsQuery, usableAccounts } from '@/entities/account';
import {
  type Goal,
  useCreateGoalMutation,
  useReplaceGoalMutation,
} from '@/entities/goal';
import { applyApiError } from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  SelectField,
  Skeleton,
  TextField,
  toast,
} from '@/shared/ui';
import styles from './GoalForm.module.css';

interface GoalFormValues {
  accountId: string;
  name: string;
  targetAmount: string;
  /** null when the goal has no deadline. */
  targetDate: string | null;
}

const valuesOf = (goal?: Goal): GoalFormValues => ({
  accountId: goal?.account.id ?? '',
  name: goal?.name ?? '',
  targetAmount: goal?.targetAmount.replace('.', ',') ?? '',
  targetDate: goal?.targetDate ?? null,
});

interface GoalFormProps {
  /** The goal to change; without it, a new one. */
  goal?: Goal;
  onSaved?: () => void;
  footer?: ReactNode;
}

export function GoalForm({ goal, onSaved, footer }: GoalFormProps) {
  const { data: accounts } = useListAccountsQuery();
  const [createGoal] = useCreateGoalMutation();
  const [replaceGoal] = useReplaceGoalMutation();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(goalInputSchema),
    defaultValues: valuesOf(goal),
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = goal
      ? await replaceGoal({ id: goal.id, body: values })
      : await createGoal(values);
    if (result.error) {
      applyApiError(result.error, setError, [
        'accountId',
        'name',
        'targetAmount',
        'targetDate',
      ]);
      return;
    }
    toast(goal ? 'Цель сохранена' : 'Цель добавлена');
    if (!goal) reset(valuesOf());
    onSaved?.();
  });

  // A <select> takes its default only if the option is already there.
  if (!accounts) return <Skeleton height={200} />;

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <TextField
        label="Название"
        placeholder="Например, на отпуск"
        error={errors.name?.message}
        {...register('name')}
      />
      <SelectField
        label="Счёт"
        error={errors.accountId?.message}
        {...register('accountId')}
      >
        <option value="">Выберите счёт</option>
        {usableAccounts(accounts.items, [goal?.account.id]).map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>
      <div className={styles.row}>
        <TextField
          label="Сколько накопить"
          inputMode="decimal"
          placeholder="200 000"
          error={errors.targetAmount?.message}
          {...register('targetAmount')}
        />
        <TextField
          label="К дате"
          type="date"
          error={errors.targetDate?.message}
          // An empty input is "no deadline", which the API takes as null;
          // '' would fail the date format before the request is built.
          {...register('targetDate', { setValueAs: (value) => value || null })}
        />
      </div>
      <p className={styles.hint}>
        Накопленное — это баланс счёта: деньги, отложенные и потраченные, уходят
        из цели вместе с ним. На одном счёте одна цель.
      </p>
      <Button type="submit" loading={isSubmitting}>
        {goal ? (
          'Сохранить'
        ) : (
          <>
            <Plus size={18} aria-hidden />
            Добавить
          </>
        )}
      </Button>
      {footer}
    </Form>
  );
}
