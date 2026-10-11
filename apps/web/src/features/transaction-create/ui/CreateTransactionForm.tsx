import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { createTransactionSchema } from '@kopilka/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import {
  KIND_OPTIONS,
  type TransactionKind,
  useListCategoriesQuery,
} from '@/entities/category';
import { useCreateTransactionMutation } from '@/entities/transaction';
import { applyApiError, toDateTimeLocal } from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  Segmented,
  SelectField,
  TextField,
} from '@/shared/ui';
import styles from './CreateTransactionForm.module.css';

const emptyValues = (categoryId = '') => ({
  categoryId,
  amount: '',
  // Local time: <input type="datetime-local"> has no time zone.
  occurredAt: toDateTimeLocal(new Date()),
  comment: '',
});

export function CreateTransactionForm() {
  const { data: categories = [] } = useListCategoriesQuery();
  const [createTransaction] = useCreateTransactionMutation();
  // Not part of the request: a transaction takes its kind from the category.
  const [kind, setKind] = useState<TransactionKind>('expense');
  const ofKind = categories.filter((category) => category.kind === kind);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    // The API validates with the same schema: "1 234,5" is accepted on
    // both sides and sent normalized as "1234.5".
    resolver: standardSchemaResolver(createTransactionSchema),
    defaultValues: emptyValues(),
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await createTransaction({
      ...values,
      occurredAt: values.occurredAt.toISOString(),
    });
    if (result.error) {
      applyApiError(result.error, setError, [
        'categoryId',
        'amount',
        'occurredAt',
        'comment',
      ]);
      return;
    }
    // Keep the category: several expenses of a kind often come in a row.
    reset(emptyValues(values.categoryId));
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <Segmented
        label="Тип операции"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setValue('categoryId', '');
        }}
      />
      <div className={styles.row}>
        <SelectField
          label="Категория"
          error={errors.categoryId?.message}
          {...register('categoryId')}
        >
          <option value="">Выберите категорию</option>
          {ofKind.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Сумма, ₽"
          inputMode="decimal"
          placeholder="0,00"
          autoComplete="off"
          error={errors.amount?.message}
          {...register('amount')}
        />
      </div>
      {ofKind.length === 0 && (
        <p className={styles.hint}>
          Категорий этого типа пока нет. <Link to="/categories">Создать</Link>
        </p>
      )}
      <div className={styles.row}>
        <TextField
          label="Дата и время"
          type="datetime-local"
          error={errors.occurredAt?.message}
          {...register('occurredAt')}
        />
        <TextField
          label="Комментарий"
          placeholder="Необязательно"
          error={errors.comment?.message}
          {...register('comment')}
        />
      </div>
      <Button type="submit" loading={isSubmitting}>
        Добавить операцию
      </Button>
    </Form>
  );
}
