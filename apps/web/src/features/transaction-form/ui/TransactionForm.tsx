import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import {
  type ReceiptQr,
  type TransactionInputDto,
  transactionInputSchema,
} from '@kopilka/shared';
import { type ReactNode, useEffect } from 'react';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { useListAccountsQuery, usableAccounts } from '@/entities/account';
import { useListCategoriesQuery } from '@/entities/category';
import { useBaseCurrency } from '@/entities/session';
import type { TransactionType } from '@/entities/transaction';
import { applyApiError, currencySymbol } from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  Segmented,
  SelectField,
  SplitFields,
  SplitToggle,
  TextField,
} from '@/shared/ui';
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
  /** A transfer between two currencies: what arrived, in the target's. */
  toAmount: string;
  /**
   * On a foreign account: the amount in the base currency, as the bank
   * charged it. Empty: the API converts at the Bank of Russia rate.
   */
  baseAmount: string;
  occurredAt: string;
  comment: string;
  /** By name; a new one becomes a tag when the transaction is saved. */
  tags: string[];
  /** The parts of a split income or expense; empty: one category. */
  splits: { categoryId: string; amount: string }[];
}

/** What the attachments may do to the form: fill it in from a receipt. */
export interface ReceiptFiller {
  /** Nothing typed into the amount yet: the receipt may fill it in. */
  amountEmpty(): boolean;
  /** The type, the amount and the time of the receipt into the form. */
  apply(qr: ReceiptQr): void;
}

const schemaResolver = standardSchemaResolver(
  transactionInputSchema,
) as unknown as Resolver<TransactionFormValues, unknown, TransactionInputDto>;

/** What the resolver needs to know beyond the values: the currencies. */
export interface FormContext {
  /** The currency of an account by id; undefined while unknown. */
  currencyOf: (accountId: string) => string | undefined;
  baseCurrency: string;
}

/**
 * The form holds the fields of every type at once (the schema drops those
 * of other types), but a category and parts are both fields of an income
 * or expense: the contract wants one of them, so the other is left out
 * before validation. The same for the amounts of other currencies: the
 * received amount only between two of them (where it is required), the
 * base amount only on a foreign account and only if typed. Error paths
 * stay those of the form's fields.
 */
const resolver: Resolver<
  TransactionFormValues,
  FormContext,
  TransactionInputDto
> = (
  { splits, categoryId, toAmount, baseAmount, ...values },
  context,
  options,
) => {
  const currency = context?.currencyOf(values.accountId);
  const crossCurrency =
    values.type === 'transfer' &&
    currency !== context?.currencyOf(values.toAccountId);
  const byHand =
    values.type !== 'transfer' &&
    currency !== undefined &&
    currency !== context?.baseCurrency &&
    baseAmount.trim() !== '';
  return schemaResolver(
    {
      ...values,
      ...(values.type === 'transfer'
        ? {}
        : splits.length
          ? { splits }
          : { categoryId }),
      ...(crossCurrency && { toAmount }),
      ...(byHand && { baseAmount }),
    } as TransactionFormValues,
    context,
    options,
  );
};

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
  /**
   * Above the submit button, after the fields: the receipt photos. As a
   * function it may fill the form in from a receipt's QR code.
   */
  attachments?: ReactNode | ((filler: ReceiptFiller) => ReactNode);
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
  // An edited transaction keeps the archived accounts it is already on.
  const accounts = usableAccounts(data?.items ?? [], [
    defaultValues.accountId,
    defaultValues.toAccountId,
  ]);
  const baseCurrency = useBaseCurrency();
  const currencyOf = (id: string) =>
    accounts.find((account) => account.id === id)?.currency;

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
  } = useForm<TransactionFormValues, FormContext, TransactionInputDto>({
    // The API validates with the same schema: "1 234,5" is accepted on
    // both sides and sent normalized as "1234.5".
    resolver,
    context: { currencyOf, baseCurrency },
    defaultValues,
  });

  const type = useWatch({ control, name: 'type' });
  const splits = useWatch({ control, name: 'splits' });
  const accountId = useWatch({ control, name: 'accountId' });
  const toAccountId = useWatch({ control, name: 'toAccountId' });
  // Amounts are in the currency of the account; the base currency until
  // one is chosen.
  const currency = currencyOf(accountId) ?? baseCurrency;
  const toCurrency = currencyOf(toAccountId);
  const crossCurrency =
    type === 'transfer' && !!toCurrency && toCurrency !== currency;
  const foreign = type !== 'transfer' && currency !== baseCurrency;
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
        'toAmount',
        'baseAmount',
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

  /**
   * Another type: a category of the other kind would only fail validation;
   * the parts keep their amounts. A transfer has no parts.
   */
  const changeType = (next: TransactionType) => {
    setValue('type', next);
    setValue('categoryId', '');
    setValue(
      'splits',
      next === 'transfer'
        ? []
        : getValues('splits').map((part) => ({ ...part, categoryId: '' })),
    );
  };

  const filler: ReceiptFiller = {
    amountEmpty: () => !getValues('amount').trim(),
    apply: (qr) => {
      if (getValues('type') !== qr.type) changeType(qr.type);
      // As people type it here: "2499,90".
      setValue('amount', qr.amount.replace('.', ','), { shouldValidate: true });
      setValue('occurredAt', qr.occurredAt, { shouldValidate: true });
    },
  };

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
              changeType(next);
            }}
          />
        )}
      />
      <TextField
        label="Сумма"
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        suffix={currencySymbol(currency)}
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
          {crossCurrency && (
            <TextField
              label="Зачислено"
              inputMode="decimal"
              placeholder="0,00"
              autoComplete="off"
              suffix={currencySymbol(toCurrency)}
              error={errors.toAmount?.message}
              {...register('toAmount')}
            />
          )}
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
          {foreign && (
            <TextField
              label="В основной валюте"
              inputMode="decimal"
              placeholder="По курсу ЦБ"
              autoComplete="off"
              suffix={currencySymbol(baseCurrency)}
              error={errors.baseAmount?.message}
              {...register('baseAmount')}
            />
          )}
          {split ? (
            <SplitFields
              legend="Части операции"
              currency={currency}
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
              <SplitToggle
                onClick={() => {
                  // The chosen category becomes the first part.
                  setValue('splits', [
                    { categoryId: getValues('categoryId'), amount: '' },
                    { categoryId: '', amount: '' },
                  ]);
                  setValue('categoryId', '');
                  clearErrors('categoryId');
                }}
              />
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
      {typeof attachments === 'function' ? attachments(filler) : attachments}
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
      {footer}
    </Form>
  );
}
