import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import {
  type CreateTransactionDto,
  createTransactionSchema,
} from '@kopilka/shared';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import {
  KIND_OPTIONS,
  type TransactionKind,
  useListCategoriesQuery,
} from '@/entities/category';
import { applyApiError } from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  Segmented,
  SelectField,
  TextField,
} from '@/shared/ui';
import styles from './TransactionForm.module.css';

/** What the inputs hold: the date as <input type="datetime-local"> wants it. */
export interface TransactionFormValues {
  categoryId: string;
  amount: string;
  occurredAt: string;
  comment: string;
}

interface TransactionFormProps {
  defaultValues: TransactionFormValues;
  defaultKind: TransactionKind;
  submitLabel: ReactNode;
  /** Sends the validated values; an error is shown in the form. */
  submit: (values: CreateTransactionDto) => Promise<{ error?: unknown }>;
  /** `reset` puts new values into the form, e.g. to add the next one. */
  onSuccess: (
    values: CreateTransactionDto,
    reset: (values: TransactionFormValues) => void,
  ) => void;
  /** Extra controls under the submit button, e.g. delete. */
  footer?: ReactNode;
}

/** The fields of a transaction, shared by the create and edit forms. */
export function TransactionForm({
  defaultValues,
  defaultKind,
  submitLabel,
  submit,
  onSuccess,
  footer,
}: TransactionFormProps) {
  const { data: categories = [] } = useListCategoriesQuery();
  // Not part of the request: a transaction takes its kind from the category.
  const [kind, setKind] = useState<TransactionKind>(defaultKind);
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
    defaultValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await submit(values);
    if (result.error) {
      applyApiError(result.error, setError, [
        'categoryId',
        'amount',
        'occurredAt',
        'comment',
      ]);
      return;
    }
    onSuccess(values, (next) => reset(next));
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <Segmented
        label="Тип операции"
        options={KIND_OPTIONS}
        value={kind}
        block
        onChange={(next) => {
          setKind(next);
          setValue('categoryId', '');
        }}
      />
      <TextField
        label="Сумма"
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        suffix="₽"
        large
        error={errors.amount?.message}
        {...register('amount')}
      />
      <div className={styles.category}>
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
        {ofKind.length === 0 && (
          <p className={styles.hint}>
            Категорий этого типа пока нет. <Link to="/categories">Создать</Link>
          </p>
        )}
      </div>
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
        {submitLabel}
      </Button>
      {footer}
    </Form>
  );
}
