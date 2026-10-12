import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { type ImportMappingDto, importMappingSchema } from '@kopilka/shared';
import {
  Controller,
  type Path,
  type Resolver,
  useForm,
  useWatch,
} from 'react-hook-form';
import { type Account, useListAccountsQuery } from '@/entities/account';
import {
  columnName,
  FilePreview,
  type Import,
  type ImportColumns,
  PRESET_NAMES,
  useSetImportMappingMutation,
} from '@/entities/import';
import { applyApiError } from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  Segmented,
  SelectField,
  Skeleton,
  TextField,
} from '@/shared/ui';
import styles from './ImportColumnsForm.module.css';

type Column = number | null;

/**
 * Every field the form can show. The request has a union for the amount
 * and a nullable status filter; toRequest() builds it from these.
 */
interface ColumnsFormValues {
  accountId: string;
  timeZone: string;
  columns: {
    date: Column;
    dateOrder: ImportColumns['dateOrder'];
    amount: {
      type: ImportColumns['amount']['type'];
      column: Column;
      income: Column;
      expense: Column;
    };
    description: Column;
    category: Column;
    status: { column: Column; value: string };
  };
}

const DATE_ORDER_OPTIONS = [
  { value: 'dmy', label: 'ДД.ММ.ГГГГ' },
  { value: 'ymd', label: 'ГГГГ-ММ-ДД' },
  { value: 'mdy', label: 'ММ/ДД/ГГГГ' },
] as const;

const AMOUNT_OPTIONS = [
  { value: 'signed', label: 'Одна колонка, расход с минусом' },
  { value: 'split', label: 'Приход и расход отдельно' },
] as const;

const toRequest = ({ accountId, timeZone, columns }: ColumnsFormValues) => ({
  accountId,
  timeZone,
  columns: {
    ...columns,
    amount:
      columns.amount.type === 'signed'
        ? { type: 'signed', column: columns.amount.column }
        : {
            type: 'split',
            income: columns.amount.income,
            expense: columns.amount.expense,
          },
    status:
      columns.status.column === null
        ? null
        : { column: columns.status.column, value: columns.status.value },
  },
});

const schemaResolver = standardSchemaResolver(importMappingSchema);

// The shared schema validates the request built from the form: the same
// rules as the API, the error paths ("columns.amount.column") those of
// the form fields.
const resolver: Resolver<ColumnsFormValues, unknown, ImportMappingDto> = (
  values,
  context,
  options,
) =>
  schemaResolver(
    toRequest(values) as never,
    context,
    options as never,
  ) as never;

const valuesOf = (
  imported: Import,
  defaultAccount: string,
): ColumnsFormValues => {
  const columns = imported.columns;
  const amount = columns?.amount;
  return {
    accountId: imported.account?.id ?? defaultAccount,
    // Statement times are local; the browser's zone is the best guess.
    timeZone:
      imported.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    columns: {
      date: columns?.date ?? null,
      dateOrder: columns?.dateOrder ?? 'dmy',
      amount: {
        type: amount?.type ?? 'signed',
        column: amount?.type === 'signed' ? amount.column : null,
        income: amount?.type === 'split' ? amount.income : null,
        expense: amount?.type === 'split' ? amount.expense : null,
      },
      description: columns?.description ?? null,
      category: columns?.category ?? null,
      status: {
        column: columns?.status?.column ?? null,
        value: columns?.status?.value ?? '',
      },
    },
  };
};

const SERVER_FIELDS = [
  'accountId',
  'columns.date',
  'columns.amount.column',
  'columns.amount.income',
  'columns.amount.expense',
  'columns.description',
  'columns.category',
  'columns.status.column',
  'columns.status.value',
] as const satisfies readonly Path<ColumnsFormValues>[];

/**
 * A <select> value to a column index; "" is "none". RHF passes the default
 * value through here too, and Number(null) is 0: null must stay null.
 */
const asColumn = {
  setValueAs: (value: unknown): Column =>
    value === '' || value === null || value === undefined
      ? null
      : Number(value),
};

interface ImportColumnsFormProps {
  imported: Import;
  onSaved?: () => void;
}

export function ImportColumnsForm(props: ImportColumnsFormProps) {
  const { data: accountList } = useListAccountsQuery();
  // A <select> takes its default only if the option is already there.
  if (!accountList) return <Skeleton height={320} />;
  return <ColumnsForm {...props} accounts={accountList.items} />;
}

function ColumnsForm({
  imported,
  onSaved,
  accounts,
}: ImportColumnsFormProps & { accounts: Account[] }) {
  const [setMapping] = useSetImportMappingMutation();

  const {
    register,
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver,
    defaultValues: valuesOf(imported, accounts[0]?.id ?? ''),
  });

  const columns = useWatch({ control, name: 'columns' });
  const roles = new Map<number, string>();
  const mark = (column: Column, role: string) => {
    if (column !== null) roles.set(column, role);
  };
  mark(columns.date, 'Дата');
  if (columns.amount.type === 'signed') mark(columns.amount.column, 'Сумма');
  else {
    mark(columns.amount.income, 'Приход');
    mark(columns.amount.expense, 'Расход');
  }
  mark(columns.description, 'Описание');
  mark(columns.category, 'Категория');
  mark(columns.status.column, 'Статус');

  const onSubmit = handleSubmit(async (body) => {
    const result = await setMapping({ id: imported.id, body });
    if (result.error) {
      applyApiError(result.error, setError, SERVER_FIELDS);
      return;
    }
    onSaved?.();
  });

  const options = imported.headers.map((_, index) => (
    <option key={index} value={index}>
      {columnName(imported.headers, index)}
    </option>
  ));
  const preset = imported.preset && PRESET_NAMES[imported.preset];

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      {preset && (
        <p className={styles.preset}>
          Формат распознан: {preset}. Колонки уже выбраны — проверьте и
          продолжайте.
        </p>
      )}
      <FilePreview imported={imported} roles={roles} />

      <SelectField
        label="Счёт"
        error={errors.accountId?.message}
        {...register('accountId')}
      >
        <option value="">Выберите счёт</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Дата</legend>
        <div className={styles.row}>
          <SelectField
            label="Колонка с датой"
            error={errors.columns?.date?.message}
            {...register('columns.date', asColumn)}
          >
            <option value="">Выберите колонку</option>
            {options}
          </SelectField>
          <Controller
            control={control}
            name="columns.dateOrder"
            render={({ field }) => (
              <div className={styles.segment}>
                <span className={styles.label}>Формат</span>
                <Segmented
                  label="Формат даты"
                  options={DATE_ORDER_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  block
                />
              </div>
            )}
          />
        </div>
        <p className={styles.hint}>
          Время из выписки считается временем пояса {getValues('timeZone')}.
        </p>
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Сумма</legend>
        <Controller
          control={control}
          name="columns.amount.type"
          render={({ field }) => (
            <Segmented
              label="Как записана сумма"
              options={AMOUNT_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              block
            />
          )}
        />
        {columns.amount.type === 'signed' ? (
          <SelectField
            label="Колонка с суммой"
            error={errors.columns?.amount?.column?.message}
            {...register('columns.amount.column', asColumn)}
          >
            <option value="">Выберите колонку</option>
            {options}
          </SelectField>
        ) : (
          <div className={styles.row}>
            <SelectField
              label="Приход"
              error={errors.columns?.amount?.income?.message}
              {...register('columns.amount.income', asColumn)}
            >
              <option value="">Выберите колонку</option>
              {options}
            </SelectField>
            <SelectField
              label="Расход"
              error={errors.columns?.amount?.expense?.message}
              {...register('columns.amount.expense', asColumn)}
            >
              <option value="">Выберите колонку</option>
              {options}
            </SelectField>
          </div>
        )}
      </fieldset>

      <fieldset className={styles.group}>
        <legend className={styles.legend}>Необязательно</legend>
        <div className={styles.row}>
          <SelectField
            label="Описание → комментарий"
            error={errors.columns?.description?.message}
            {...register('columns.description', asColumn)}
          >
            <option value="">Нет</option>
            {options}
          </SelectField>
          <SelectField
            label="Категория банка"
            error={errors.columns?.category?.message}
            {...register('columns.category', asColumn)}
          >
            <option value="">Нет</option>
            {options}
          </SelectField>
        </div>
        <div className={styles.row}>
          <SelectField
            label="Брать только строки, где колонка"
            error={errors.columns?.status?.column?.message}
            {...register('columns.status.column', asColumn)}
          >
            <option value="">Все строки</option>
            {options}
          </SelectField>
          {columns.status.column !== null && (
            <TextField
              label="равна"
              placeholder="Например, OK"
              error={errors.columns?.status?.value?.message}
              {...register('columns.status.value')}
            />
          )}
        </div>
      </fieldset>

      <Button type="submit" loading={isSubmitting}>
        {imported.status === 'uploaded' ? 'Разобрать файл' : 'Разобрать заново'}
      </Button>
    </Form>
  );
}
