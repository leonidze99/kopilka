import { useForm } from 'react-hook-form';
import {
  type Category,
  KIND_OPTIONS,
  useCreateCategoryMutation,
  useListCategoriesQuery,
} from '@/entities/category';
import {
  type Import,
  OPERATIONS,
  ROWS,
  useCommitImportMutation,
} from '@/entities/import';
import { errorMessage, formatMoney, pluralize, toApiError } from '@/shared/lib';
import { Button, Form, FormError, SelectField, Skeleton } from '@/shared/ui';
import styles from './ImportCategoriesForm.module.css';

/** The option that creates a category named as the bank's one. */
const NEW = 'new';

interface CategoriesFormValues {
  /** Per group: a category id, NEW, or '' (not chosen). */
  groups: string[];
}

const kindLabel = (kind: string) =>
  KIND_OPTIONS.find((option) => option.value === kind)?.label;

const GROUP_FIELD = /^categories\.(\d+)\.categoryId$/;

interface ImportCategoriesFormProps {
  imported: Import;
}

/**
 * A category for every bank category among the new rows, then the
 * go-ahead. Suggestions (remembered or same-named) are filled in.
 */
export function ImportCategoriesForm({ imported }: ImportCategoriesFormProps) {
  const { data: categories } = useListCategoriesQuery();
  // A <select> takes its default only if the option is already there:
  // with the list still loading it would show "not chosen" over a choice.
  if (!categories) {
    return <Skeleton height={160} />;
  }
  return <CategoriesForm imported={imported} categories={categories} />;
}

function CategoriesForm({
  imported,
  categories,
}: ImportCategoriesFormProps & { categories: Category[] }) {
  const [createCategory] = useCreateCategoryMutation();
  const [commit] = useCommitImportMutation();
  const groups = imported.categories;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoriesFormValues>({
    defaultValues: { groups: groups.map((group) => group.category?.id ?? '') },
  });

  const onSubmit = handleSubmit(async ({ groups: chosen }) => {
    const ids: string[] = [];
    for (const [index, group] of groups.entries()) {
      const value = chosen[index] ?? '';
      if (value !== NEW) {
        ids.push(value);
        continue;
      }
      const created = await createCategory({
        kind: group.kind,
        name: group.source ?? '',
      });
      if (created.error) {
        setError(`groups.${index}`, {
          type: 'server',
          message:
            toApiError(created.error)?.details?.[0]?.message ??
            errorMessage(created.error),
        });
        return;
      }
      ids.push(created.data.id);
    }

    const result = await commit({
      id: imported.id,
      body: {
        categories: groups.map((group, index) => ({
          kind: group.kind,
          source: group.source,
          categoryId: ids[index] ?? '',
        })),
      },
    });
    if (!result.error) return;
    // The request lists the groups in their order: categories.N is group N.
    let placed = false;
    for (const detail of toApiError(result.error)?.details ?? []) {
      const index = GROUP_FIELD.exec(detail.field ?? '')?.[1];
      if (index === undefined) continue;
      setError(`groups.${Number(index)}`, {
        type: 'server',
        message: detail.message,
      });
      placed = true;
    }
    if (!placed) {
      setError('root.server', {
        type: 'server',
        message: errorMessage(result.error),
      });
    }
  });

  const total = imported.counts.new;

  return (
    <Form onSubmit={onSubmit}>
      {/* Why the last attempt was sent back, e.g. not enough money. */}
      <FormError
        message={errors.root?.server?.message ?? imported.error ?? undefined}
      />
      {groups.length > 0 && (
        <ul className={styles.groups} aria-label="Категории из выписки">
          {groups.map((group, index) => {
            const name = group.source ?? 'Без категории';
            const ofKind = categories.filter((c) => c.kind === group.kind);
            // A same-named category is the suggestion already; creating
            // another would clash with it (names are unique per kind).
            const source = group.source?.toLowerCase();
            const canCreate =
              source !== undefined &&
              !ofKind.some((c) => c.name.toLowerCase() === source);
            return (
              <li
                key={`${group.kind}:${group.source}`}
                className={styles.group}
              >
                <div className={styles.source}>
                  <span className={styles.name}>{name}</span>
                  <span className={styles.meta}>
                    {kindLabel(group.kind)} · {pluralize(group.rows, ROWS)} ·{' '}
                    {formatMoney(group.total)}
                  </span>
                </div>
                <SelectField
                  label={`Категория для «${name}»`}
                  hideLabel
                  error={errors.groups?.[index]?.message}
                  {...register(`groups.${index}`, {
                    required: 'Выберите категорию',
                  })}
                >
                  <option value="">Выберите категорию</option>
                  {ofKind.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                  {canCreate && (
                    <option value={NEW}>
                      + Новая категория «{group.source}»
                    </option>
                  )}
                </SelectField>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.hint}>
        {total > 0
          ? 'Выбор запомнится: в следующий раз эти категории подставятся сами.'
          : 'Новых операций нет: всё из этого файла уже есть на счёте.'}
      </p>
      <Button type="submit" loading={isSubmitting}>
        {total > 0
          ? `Импортировать ${pluralize(total, OPERATIONS)}`
          : 'Завершить'}
      </Button>
    </Form>
  );
}
