import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { tagBudgetFormSchema } from '@kopilka/shared';
import { useForm } from 'react-hook-form';
import { type Tag, useSetTagBudgetMutation } from '@/entities/tag';
import { applyApiError, errorMessage } from '@/shared/lib';
import { Button, Form, FormError, TextField, toast } from '@/shared/ui';
import styles from './TagBudgetForm.module.css';

interface TagBudgetFormProps {
  tag: Tag;
  onDone: () => void;
}

/**
 * What a tag may cost over all time: one number, no months — "Отпуск" is
 * the whole trip, whichever months it took.
 */
export function TagBudgetForm({ tag, onDone }: TagBudgetFormProps) {
  const [setBudget, { isLoading: removing, error: removeError }] =
    useSetTagBudgetMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(tagBudgetFormSchema),
    // "150000.00" as people write it here.
    defaultValues: { amount: tag.budget?.limit.replace('.', ',') ?? '' },
  });

  const onSubmit = handleSubmit(async ({ amount }) => {
    const result = await setBudget({ id: tag.id, amount });
    if (result.error) {
      applyApiError(result.error, setError, ['amount']);
      return;
    }
    toast('Бюджет тега сохранён');
    onDone();
  });

  const remove = async () => {
    const result = await setBudget({ id: tag.id, amount: null });
    if (result.error) return;
    toast('Бюджет тега убран');
    onDone();
  };

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <TextField
        label="Бюджет на всё время"
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        suffix="₽"
        error={errors.amount?.message}
        {...register('amount')}
      />
      <p className={styles.hint}>
        Считаются все расходы с этим тегом, за любые месяцы.
      </p>
      <Button type="submit" variant="secondary" loading={isSubmitting}>
        {tag.budget ? 'Изменить бюджет' : 'Задать бюджет'}
      </Button>
      {tag.budget && (
        <>
          <Button
            type="button"
            variant="ghost"
            loading={removing}
            onClick={remove}
          >
            Убрать бюджет
          </Button>
          <FormError message={removeError && errorMessage(removeError)} />
        </>
      )}
    </Form>
  );
}
