import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import {
  type TransactionInputDto,
  transactionInputSchema,
} from '@kopilka/shared';
import { type ReactNode, useEffect } from 'react';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { useListAccountsQuery } from '@/entities/account';
import { useListCategoriesQuery } from '@/entities/category';
import type { TransactionType } from '@/entities/transaction';
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

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Расход' },
  { value: 'income', label: 'Доход' },
  { value: 'transfer', label: 'Перевод' },
] as const satisfies readonly { value: TransactionType; label: string }[];

/**
 * What the inputs hold: every field of every type (the schema keeps the
 * ones of the chosen type), the date as <input type="datetime-local">
 * wants it.
 */
export interface TransactionFormValues {
  type: TransactionType;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  amount: string;
  occurredAt: string;
  comment: string;
}

interface TransactionFormProps {
  defaultValues: TransactionFormValues;
  submitLabel: ReactNode;
  /** Sends the validated values; an error is shown in the form. */
  submit: (values: TransactionInputDto) => Promise<{ error?: unknown }>;
  /** `reset` puts new values into the form, e.g. to add the next one. */
  onSuccess: (
    values: TransactionInputDto,
    reset: (values: TransactionFormValues) => void,
  ) => void;
  /** Extra controls under the submit button, e.g. delete. */
  footer?: ReactNode;
}

/** The fields of a transaction, shared by the create and edit forms. */
export function TransactionForm({
  defaultValues,
  submitLabel,
  submit,
  onSuccess,
  footer,
}: TransactionFormProps) {
  const { data: categories = [] } = useListCategoriesQuery();
  const { data, isSuccess: accountsLoaded } = useListAccountsQuery();
  const accounts = data?.items ?? [];

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    // The API validates with the same schema: "1 234,5" is accepted on
    // both sides and sent normalized as "1234.5".
    // The form holds the fields of every type at once; the schema keeps
    // those of the chosen one. Its input type is the union, hence the cast.
    resolver: standardSchemaResolver(
      transactionInputSchema,
    ) as unknown as Resolver<
      TransactionFormValues,
      unknown,
      TransactionInputDto
    >,
    defaultValues,
  });

  const type = useWatch({ control, name: 'type' });
  const ofKind = categories.filter((category) => category.kind === type);

  // Most people have one account: preselect the first one once it loads.
  const firstAccount = accounts[0]?.id;
  useEffect(() => {
    if (firstAccount && !getValues('accountId')) {
      setValue('accountId', firstAccount);
    }
  }, [firstAccount, getValues, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    const result = await submit(values);
    if (result.error) {
      applyApiError(result.error, setError, [
        'type',
        'categoryId',
        'accountId',
        'toAccountId',
        'amount',
        'occurredAt',
        'comment',
      ]);
      return;
    }
    onSuccess(values, (next) => reset(next));
  });

  const accountOptions = accounts.map((account) => (
    <option key={account.id} value={account.id}>
      {account.name}
    </option>
  ));

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Segmented
            label="Тип операции"
            options={TYPE_OPTIONS}
            value={field.value}
            block
            onChange={(next) => {
              field.onChange(next);
              // A category of the other kind would only fail validation.
              setValue('categoryId', '');
            }}
          />
        )}
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

      {type === 'transfer' ? (
        <div className={styles.group}>
          <div className={styles.row}>
            <SelectField
              label="Со счёта"
              error={errors.accountId?.message}
              {...register('accountId')}
            >
              <option value="">Выберите счёт</option>
              {accountOptions}
            </SelectField>
            <SelectField
              label="На счёт"
              error={errors.toAccountId?.message}
              {...register('toAccountId')}
            >
              <option value="">Выберите счёт</option>
              {accountOptions}
            </SelectField>
          </div>
          {accountsLoaded && accounts.length < 2 && (
            <p className={styles.hint}>
              Для перевода нужен второй счёт.{' '}
              <Link to="/accounts">Добавить</Link>
            </p>
          )}
        </div>
      ) : (
        <div className={styles.group}>
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
            <SelectField
              label="Счёт"
              error={errors.accountId?.message}
              {...register('accountId')}
            >
              <option value="">Выберите счёт</option>
              {accountOptions}
            </SelectField>
          </div>
          {ofKind.length === 0 && (
            <p className={styles.hint}>
              Категорий этого типа пока нет.{' '}
              <Link to="/categories">Создать</Link>
            </p>
          )}
          {accountsLoaded && accounts.length === 0 && (
            <p className={styles.hint}>
              Счетов пока нет. <Link to="/accounts">Создать</Link>
            </p>
          )}
        </div>
      )}

      <div className={styles.wideRow}>
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
