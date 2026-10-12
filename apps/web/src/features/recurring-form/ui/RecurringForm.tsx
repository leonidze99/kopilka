import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { type RecurringInputDto, recurringInputSchema } from '@kopilka/shared';
import { Plus } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import { useListAccountsQuery } from '@/entities/account';
import { useListCategoriesQuery } from '@/entities/category';
import {
  type RecurringRule,
  useCreateRecurringMutation,
  useReplaceRecurringMutation,
} from '@/entities/recurring';
import type { TransactionType } from '@/entities/transaction';
import { applyApiError, toDateTimeLocal } from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  Segmented,
  SelectField,
  Switch,
  TextField,
  toast,
} from '@/shared/ui';
import styles from './RecurringForm.module.css';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Расход' },
  { value: 'income', label: 'Доход' },
  { value: 'transfer', label: 'Перевод' },
] as const satisfies readonly { value: TransactionType; label: string }[];

/** Every field of every type; the schema keeps those of the chosen one. */
interface RecurringFormValues {
  type: TransactionType;
  categoryId: string;
  accountId: string;
  toAccountId: string;
  amount: string;
  comment: string;
  startOn: string;
  timeZone: string;
  active: boolean;
}

// Dates are in the zone of this browser: a payment is due when its day
// begins here.
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

const valuesOf = (rule?: RecurringRule): RecurringFormValues => ({
  type: rule?.type ?? 'expense',
  categoryId: rule && rule.type !== 'transfer' ? rule.category.id : '',
  accountId: rule?.account.id ?? '',
  toAccountId: rule?.type === 'transfer' ? rule.toAccount.id : '',
  amount: rule?.amount.replace('.', ',') ?? '',
  comment: rule?.comment ?? '',
  startOn: rule?.startOn ?? toDateTimeLocal(new Date()).slice(0, 10),
  timeZone: rule?.timeZone ?? browserZone(),
  active: rule?.active ?? true,
});

interface RecurringFormProps {
  /** The rule to change; without it, a new one. */
  rule?: RecurringRule;
  onSaved?: () => void;
  footer?: ReactNode;
}

export function RecurringForm({ rule, onSaved, footer }: RecurringFormProps) {
  const { data: categories = [] } = useListCategoriesQuery();
  const { data: accountList } = useListAccountsQuery();
  const accounts = accountList?.items ?? [];
  const [createRecurring] = useCreateRecurringMutation();
  const [replaceRecurring] = useReplaceRecurringMutation();

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
    // Same cast as the transaction form: flat values, a union schema.
    resolver: standardSchemaResolver(
      recurringInputSchema,
    ) as unknown as Resolver<RecurringFormValues, unknown, RecurringInputDto>,
    defaultValues: valuesOf(rule),
  });

  const type = useWatch({ control, name: 'type' });
  const ofKind = categories.filter((category) => category.kind === type);

  const firstAccount = accounts[0]?.id;
  useEffect(() => {
    if (firstAccount && !getValues('accountId')) {
      setValue('accountId', firstAccount);
    }
  }, [firstAccount, getValues, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    const result = rule
      ? await replaceRecurring({ id: rule.id, body: values })
      : await createRecurring(values);
    if (result.error) {
      applyApiError(result.error, setError, [
        'categoryId',
        'accountId',
        'toAccountId',
        'amount',
        'comment',
        'startOn',
      ]);
      return;
    }
    toast(rule ? 'Изменения сохранены' : 'Регулярная операция добавлена');
    if (!rule) reset(valuesOf());
    onSaved?.();
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
      <div className={styles.row}>
        {type === 'transfer' ? (
          <>
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
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      <div className={styles.row}>
        <TextField
          label="Первый платёж"
          type="date"
          error={errors.startOn?.message}
          {...register('startOn')}
        />
        <TextField
          label="Комментарий"
          placeholder="Например, аренда"
          error={errors.comment?.message}
          {...register('comment')}
        />
      </div>
      <p className={styles.hint}>
        Дальше — в тот же день каждого месяца. Прошедшие даты не заполняются:
        первая операция появится не раньше сегодняшнего дня.
      </p>
      {rule && (
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Switch
              label="Включена"
              description="На паузе новые операции не создаются"
              checked={field.value}
              onChange={(event) => field.onChange(event.target.checked)}
              onBlur={field.onBlur}
            />
          )}
        />
      )}
      <Button type="submit" loading={isSubmitting}>
        {rule ? (
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
