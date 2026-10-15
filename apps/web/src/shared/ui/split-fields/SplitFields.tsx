import { fromKopecks, MAX_SPLITS, toKopecks } from '@kopilka/shared';
import { Plus, Split, X } from 'lucide-react';
import {
  type ArrayPath,
  type Control,
  type FieldArray,
  type FieldErrors,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormRegister,
  type UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form';
import { currencySymbol, formatMoney } from '@/shared/lib';
import { Button } from '../button/Button';
import { SelectField } from '../select/SelectField';
import { TextField } from '../text-field/TextField';
import styles from './SplitFields.module.css';

/** What a form with parts holds: an amount, and the parts of it. */
export interface SplitValues {
  amount: string;
  splits: { categoryId: string; amount: string }[];
}

interface SplitFieldsProps<T extends FieldValues & SplitValues, C, R> {
  control: Control<T, C, R>;
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<SplitValues>;
  /** The categories of the record's kind. */
  categories: { id: string; name: string }[];
  /** Back to one category for the whole record. */
  onJoin: () => void;
  /** Of the account: the parts are in it. */
  currency: string;
  /** "Части операции", "Части платежа". */
  legend: string;
}

/** Kopecks of what is typed; 0 for an empty field, NaN for a non-number. */
const kopecksOf = (value: string) => (value.trim() ? toKopecks(value) : 0);

/**
 * The parts of a split income or expense — a transaction, or each payment
 * of a recurring rule: a category and an amount each, and what is left of
 * the amount to spread over them. The sum is counted in whole kopecks —
 * exact, as the API checks it.
 *
 * Generic over the form: any form with \`amount\` and \`splits\` fields. The
 * paths are cast once here (react-hook-form cannot see them through T).
 */
export function SplitFields<T extends FieldValues & SplitValues, C, R>({
  control,
  register,
  setValue,
  errors,
  categories,
  onJoin,
  currency,
  legend,
}: SplitFieldsProps<T, C, R>) {
  const path = (name: string) => name as Path<T>;
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'splits' as ArrayPath<T>,
  });
  const amount = useWatch({ control, name: path('amount') }) as string;
  const splits = useWatch({
    control,
    name: path('splits'),
  }) as SplitValues['splits'];

  const total = kopecksOf(amount);
  const parts = splits.reduce((sum, split) => sum + kopecksOf(split.amount), 0);
  const left = total - parts;
  const counted = !Number.isNaN(left) && total > 0;
  // A part without an amount takes the rest in one click.
  const emptyPart = splits.findIndex((split) => !split.amount.trim());

  const listError = errors.splits?.root?.message ?? errors.splits?.message;

  return (
    <fieldset className={styles.splits}>
      <legend className={styles.splitsTitle}>{legend}</legend>
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
              {...register(path(`splits.${index}.categoryId`))}
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
              suffix={currencySymbol(currency)}
              error={errors.splits?.[index]?.amount?.message}
              {...register(path(`splits.${index}.amount`))}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
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
            onClick={() =>
              append({ categoryId: '', amount: '' } as FieldArray<
                T,
                ArrayPath<T>
              >)
            }
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
              Не распределено {formatMoney(fromKopecks(left), currency)}
              {emptyPart >= 0 && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() =>
                      setValue(
                        path(`splits.${emptyPart}.amount`),
                        fromKopecks(left).replace('.', ',') as PathValue<
                          T,
                          Path<T>
                        >,
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
            `Части больше суммы на ${formatMoney(fromKopecks(-left), currency)}`}
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

/** "Разделить по категориям": a quiet link under the category select. */
export function SplitToggle({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.splitToggle} onClick={onClick}>
      <Split size={15} aria-hidden />
      Разделить по категориям
    </button>
  );
}
