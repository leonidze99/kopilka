import {
  fromKopecks,
  MAX_SPLITS,
  toKopecks,
  type TransactionInputDto,
} from '@kopilka/shared';
import { Plus, X } from 'lucide-react';
import {
  type Control,
  type FieldErrors,
  type UseFormRegister,
  type UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form';
import { formatMoney } from '@/shared/lib';
import { Button, SelectField, TextField } from '@/shared/ui';
import type { TransactionFormValues } from './TransactionForm';
import styles from './TransactionForm.module.css';

interface SplitFieldsProps {
  control: Control<TransactionFormValues, unknown, TransactionInputDto>;
  register: UseFormRegister<TransactionFormValues>;
  setValue: UseFormSetValue<TransactionFormValues>;
  errors: FieldErrors<TransactionFormValues>;
  /** The categories of the transaction's kind. */
  categories: { id: string; name: string }[];
  /** Back to one category for the whole transaction. */
  onJoin: () => void;
}

/** Kopecks of what is typed; 0 for an empty field, NaN for a non-number. */
const kopecksOf = (value: string) => (value.trim() ? toKopecks(value) : 0);

/**
 * The parts of a split transaction: a category and an amount each, and
 * what is left of the transaction's amount to spread over them. The sum is
 * counted in whole kopecks — exact, as the API checks it.
 */
export function SplitFields({
  control,
  register,
  setValue,
  errors,
  categories,
  onJoin,
}: SplitFieldsProps) {
  const { fields, append, remove } = useFieldArray({ control, name: 'splits' });
  const amount = useWatch({ control, name: 'amount' });
  const splits = useWatch({ control, name: 'splits' });

  const total = kopecksOf(amount);
  const parts = splits.reduce((sum, split) => sum + kopecksOf(split.amount), 0);
  const left = total - parts;
  const counted = !Number.isNaN(left) && total > 0;
  // A part without an amount takes the rest in one click.
  const emptyPart = splits.findIndex((split) => !split.amount.trim());

  const listError = errors.splits?.root?.message ?? errors.splits?.message;

  return (
    <fieldset className={styles.splits}>
      <legend className={styles.splitsTitle}>Части операции</legend>
      {fields.map((field, index) => {
        const taken = new Set(
          splits
            .filter((_, other) => other !== index)
            .map((split) => split.categoryId),
        );
        return (
          <div key={field.id} className={styles.splitRow}>
            <SelectField
              label={`Категория части ${index + 1}`}
              hideLabel
              error={errors.splits?.[index]?.categoryId?.message}
              {...register(`splits.${index}.categoryId`)}
            >
              <option value="">Категория</option>
              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                  // One part per category: the API takes nothing else.
                  disabled={taken.has(category.id)}
                >
                  {category.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label={`Сумма части ${index + 1}`}
              inputMode="decimal"
              placeholder={
                counted && left > 0 && !splits[index]?.amount.trim()
                  ? fromKopecks(left).replace('.', ',')
                  : '0,00'
              }
              autoComplete="off"
              suffix="₽"
              error={errors.splits?.[index]?.amount?.message}
              {...register(`splits.${index}.amount`)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={styles.splitRemove}
              aria-label={`Убрать часть ${index + 1}`}
              // Fewer than two parts is no split: "Не разделять" is for that.
              disabled={fields.length <= 2}
              onClick={() => remove(index)}
            >
              <X size={16} aria-hidden />
            </Button>
          </div>
        );
      })}

      <div className={styles.splitsFooter}>
        {fields.length < MAX_SPLITS && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => append({ categoryId: '', amount: '' })}
          >
            <Plus size={16} aria-hidden />
            Ещё часть
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onJoin}>
          Не разделять
        </Button>
      </div>

      {counted && (
        <p
          className={left < 0 ? styles.splitsOver : styles.hint}
          aria-live="polite"
        >
          {left === 0 && 'Сумма распределена полностью'}
          {left > 0 && (
            <>
              Не распределено {formatMoney(fromKopecks(left))}
              {emptyPart >= 0 && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() =>
                      setValue(
                        `splits.${emptyPart}.amount`,
                        fromKopecks(left).replace('.', ','),
                        { shouldValidate: true },
                      )
                    }
                  >
                    вписать в часть {emptyPart + 1}
                  </button>
                </>
              )}
            </>
          )}
          {left < 0 &&
            `Части больше суммы на ${formatMoney(fromKopecks(-left))}`}
        </p>
      )}
      {listError && (
        <p className={styles.splitsOver} role="alert">
          {listError}
        </p>
      )}
    </fieldset>
  );
}
