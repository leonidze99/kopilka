import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { createAccountSchema, type CreateAccountDto } from '@kopilka/shared';
import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ACCOUNT_TYPE_OPTIONS, type AccountType } from '@/entities/account';
import { applyApiError } from '@/shared/lib';
import {
  Button,
  Form,
  FormError,
  Segmented,
  Switch,
  TextField,
} from '@/shared/ui';

export interface AccountFormValues {
  name: string;
  type: AccountType;
  openingBalance: string;
  allowNegative: boolean;
}

interface AccountFormProps {
  defaultValues: AccountFormValues;
  submitLabel: ReactNode;
  submit: (values: CreateAccountDto) => Promise<{ error?: unknown }>;
  onSuccess: (reset: (values: AccountFormValues) => void) => void;
  footer?: ReactNode;
}

/** The fields of an account, shared by the create and edit forms. */
export function AccountForm({
  defaultValues,
  submitLabel,
  submit,
  onSuccess,
  footer,
}: AccountFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(createAccountSchema),
    defaultValues,
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await submit(values);
    if (result.error) {
      // INSUFFICIENT_FUNDS lands under the field that caused it.
      applyApiError(result.error, setError, [
        'name',
        'type',
        'openingBalance',
        'allowNegative',
      ]);
      return;
    }
    onSuccess((next) => reset(next));
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Segmented
            label="Тип счёта"
            options={ACCOUNT_TYPE_OPTIONS}
            value={field.value}
            onChange={field.onChange}
            block
          />
        )}
      />
      <TextField
        label="Название"
        placeholder="Например, Карта Т-Банка"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Начальный остаток"
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        suffix="₽"
        error={errors.openingBalance?.message}
        {...register('openingBalance', {
          // Empty means zero: the schema's default fills it in.
          setValueAs: (value: string) => (value === '' ? undefined : value),
        })}
      />
      <Controller
        control={control}
        name="allowNegative"
        render={({ field }) => (
          <div>
            {/* Shown the other way round: the safe option is the one to turn on. */}
            <Switch
              label="Не уходить в минус"
              description="Операция, после которой остаток станет меньше нуля, не сохранится"
              checked={!field.value}
              onChange={(event) => field.onChange(!event.target.checked)}
              onBlur={field.onBlur}
            />
            <FormError message={errors.allowNegative?.message} />
          </div>
        )}
      />
      <Button type="submit" loading={isSubmitting}>
        {submitLabel}
      </Button>
      {footer}
    </Form>
  );
}
