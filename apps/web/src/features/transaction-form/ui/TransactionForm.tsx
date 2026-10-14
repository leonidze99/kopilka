import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import {
  type TransactionInputDto,
  transactionInputSchema,
} from '@kopilka/shared';
import { type ReactNode, useEffect } from 'react';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { Split } from 'lucide-react';
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
import { SplitFields } from './SplitFields';
import { TagsField } from './TagsField';
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
  /** By name; a new one becomes a tag when the transaction is saved. */
  tags: string[];
  /** The parts of a split income or expense; empty: one category. */
  splits: { categoryId: string; amount: string }[];
}

const schemaResolver = standardSchemaResolver(
  transactionInputSchema,
) as unknown as Resolver<TransactionFormValues, unknown, TransactionInputDto>;

/**
 * The form holds the fields of every type at once (the schema drops those
 * of other types), but a category and parts are both fields of an income
 * or expense: the contract wants one of them, so the other is left out
 * before validation. Error paths stay those of the form's fields.
 */
const resolver: Resolver<
  TransactionFormValues,
  unknown,
  TransactionInputDto
> = ({ splits, categoryId, ...values }, context, options) =>
  schemaResolver(
    (values.type === 'transfer'
      ? values
      : splits.length
        ? { ...values, splits }
        : { ...values, categoryId }) as TransactionFormValues,
    context,
    options,
  );

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
  /** Above the submit button, after the fields: the receipt photos. */
  attachments?: ReactNode;
  /** Extra controls under the submit button, e.g. delete. */
  footer?: ReactNode;
}

/** The fields of a transaction, shared by the create and edit forms. */
export function TransactionForm({
  defaultValues,
  submitLabel,
  submit,
  onSuccess,
  attachments,
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
    clearErrors,
    getValues,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    // The API validates with the same schema: "1 234,5" is accepted on
    // both sides and sent normalized as "1234.5".
    resolver,
    defaultValues,
  });

  const type = useWatch({ control, name: 'type' });
  const splits = useWatch({ control, name: 'splits' });
  const split = type !== 'transfer' && splits.length > 0;
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
        'splits',
        'tags',
        // e.g. "splits.1.categoryId": a part in a category of another kind.
        ...getValues('splits').flatMap((_, index) => [
          `splits.${index}.categoryId` as const,
          `splits.${index}.amount` as const,
        ]),
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
              // A category of the other kind would only fail validation;
              // the parts keep their amounts. A transfer has no parts.
              setValue('categoryId', '');
              setValue(
                'splits',
                next === 'transfer'
                  ? []
                  : getValues('splits').map((part) => ({
                      ...part,
                      categoryId: '',
                    })),
              );
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
            {!split && (
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
            )}
            <SelectField
              label="Счёт"
              error={errors.accountId?.message}
              {...register('accountId')}
            >
              <option value="">Выберите счёт</option>
              {accountOptions}
            </SelectField>
          </div>
          {split ? (
            <SplitFields
              control={control}
              register={register}
              setValue={setValue}
              errors={errors}
              categories={ofKind}
              onJoin={() => {
                // The largest part's category, or the first chosen.
                setValue('categoryId', getValues('splits.0.categoryId'));
                setValue('splits', []);
                clearErrors('splits');
              }}
            />
          ) : (
            ofKind.length > 1 && (
              <button
                type="button"
                className={styles.splitToggle}
                onClick={() => {
                  // The chosen category becomes the first part.
                  setValue('splits', [
                    { categoryId: getValues('categoryId'), amount: '' },
                    { categoryId: '', amount: '' },
                  ]);
                  setValue('categoryId', '');
                  clearErrors('categoryId');
                }}
              >
                <Split size={15} aria-hidden />
                Разделить по категориям
              </button>
            )
          )}
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
      <Controller
        control={control}
        name="tags"
        render={({ field }) => (
          <TagsField
            value={field.value}
            onChange={field.onChange}
            // The list as a whole, or the first name that is wrong.
            error={
              errors.tags?.message ??
              errors.tags?.root?.message ??
              (Array.isArray(errors.tags)
                ? errors.tags.find(Boolean)?.message
                : undefined)
            }
          />
        )}
      />
      {attachments}
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
      {footer}
    </Form>
  );
}
