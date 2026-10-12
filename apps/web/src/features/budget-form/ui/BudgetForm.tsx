import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { budgetFormSchema } from '@kopilka/shared';
import { useForm } from 'react-hook-form';
import { type Budget, useSetBudgetMutation } from '@/entities/budget';
import { useListCategoriesQuery } from '@/entities/category';
import {
  applyApiError,
  errorMessage,
  formatMonthIn,
  type Month,
} from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  SelectField,
  TextField,
  toast,
} from '@/shared/ui';
import styles from './BudgetForm.module.css';

interface BudgetFormProps {
  /** The month the limit applies from. */
  month: Month;
  /** The limit to change; without it, a new one for a category to pick. */
  budget?: Budget;
  /** Categories that already have a limit: not offered for a new one. */
  budgetedIds?: string[];
  onDone: () => void;
}

export function BudgetForm({
  month,
  budget,
  budgetedIds = [],
  onDone,
}: BudgetFormProps) {
  const { data: categories = [] } = useListCategoriesQuery();
  const [setBudget, { isLoading: removing, error: removeError }] =
    useSetBudgetMutation();
  const available = categories.filter(
    (category) =>
      category.kind === 'expense' && !budgetedIds.includes(category.id),
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(budgetFormSchema),
    defaultValues: {
      categoryId: budget?.category.id ?? '',
      // "10000.00" as people write it here.
      amount: budget?.limit.replace('.', ',') ?? '',
    },
  });

  const onSubmit = handleSubmit(async ({ categoryId, amount }) => {
    const result = await setBudget({ categoryId, month, amount });
    if (result.error) {
      applyApiError(result.error, setError, ['amount']);
      return;
    }
    toast('Бюджет сохранён');
    onDone();
  });

  const remove = async () => {
    if (!budget) return;
    const result = await setBudget({
      categoryId: budget.category.id,
      month,
      amount: null,
    });
    if (result.error) return;
    toast('Бюджет убран');
    onDone();
  };

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      {!budget && (
        <SelectField
          label="Категория"
          error={errors.categoryId?.message}
          {...register('categoryId')}
        >
          <option value="">Выберите категорию</option>
          {available.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      )}
      <TextField
        label="Лимит в месяц"
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        suffix="₽"
        large
        error={errors.amount?.message}
        {...register('amount')}
      />
      <p className={styles.hint}>
        {`Действует с ${formatMonthIn(month)} и дальше, пока не измените. Прошлые месяцы останутся как были.`}
      </p>
      <Button type="submit" loading={isSubmitting}>
        Сохранить
      </Button>
      {budget && (
        <>
          <Button
            type="button"
            variant="ghost"
            loading={removing}
            onClick={remove}
          >
            {`Убрать бюджет с ${formatMonthIn(month)}`}
          </Button>
          <FormError message={removeError && errorMessage(removeError)} />
        </>
      )}
    </Form>
  );
}
