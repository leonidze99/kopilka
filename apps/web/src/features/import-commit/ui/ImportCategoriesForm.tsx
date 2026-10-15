import { useForm, useWatch } from 'react-hook-form';
import {
  type Account,
  useListAccountsQuery,
  usableAccounts,
} from '@/entities/account';
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
import {
  errorMessage,
  formatDay,
  formatMoney,
  formatSignedMoney,
  formatTime,
  pluralize,
  toApiError,
} from '@/shared/lib';
import { Button, Form, FormError, SelectField, Skeleton } from '@/shared/ui';
import styles from './ImportCategoriesForm.module.css';

/** The option that creates a category named as the bank's one. */
const NEW = 'new';

/**
 * A group may go to an account instead of a category: in the statement of
 * one account a move to another reads as an ordinary income or expense.
 * One <select> holds both, so the value says which was picked.
 */
const TRANSFER = 'transfer:';
const transferTo = (accountId: string) => `${TRANSFER}${accountId}`;

interface CategoriesFormValues {
  /** Per group: a category id, NEW, or '' (not chosen). */
  groups: string[];
  /** Per possible duplicate: leave it out of the import. */
  skip: boolean[];
}

const kindLabel = (kind: string) =>
  KIND_OPTIONS.find((option) => option.value === kind)?.label;

const groupKey = (kind: string, source: string | null) => `${kind}:${source}`;

const GROUP_FIELD = /^categories[.](d+)[.](?:categoryId|toAccountId)$/;

const when = (iso: string) => `${formatDay(iso)}, ${formatTime(iso)}`;

interface ImportCategoriesFormProps {
  imported: Import;
}

/**
 * The go-ahead: possible duplicates to leave out, and a category for every
 * bank category among the rows that go in. Suggestions (remembered or
 * same-named categories; skipping a duplicate) are filled in.
 */
export function ImportCategoriesForm({ imported }: ImportCategoriesFormProps) {
  const { data: categories } = useListCategoriesQuery();
  const { data: accounts } = useListAccountsQuery();
  // A <select> takes its default only if the option is already there:
  // with the lists still loading it would show "not chosen" over a choice.
  if (!categories || !accounts) {
    return <Skeleton height={160} />;
  }
  return (
    <CategoriesForm
      imported={imported}
      categories={categories}
      // Every other account: a transfer has two sides, and one of them is
      // the account being imported into.
      accounts={usableAccounts(accounts.items).filter(
        (account) => account.id !== imported.account?.id,
      )}
    />
  );
}

function CategoriesForm({
  imported,
  categories,
  accounts,
}: ImportCategoriesFormProps & {
  categories: Category[];
  accounts: Account[];
}) {
  const [createCategory] = useCreateCategoryMutation();
  const [commit] = useCommitImportMutation();
  const { categories: groups, possibleDuplicates: duplicates } = imported;
  // The statement is in the currency of the account it goes into.
  const currency = imported.account?.currency ?? 'RUB';

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CategoriesFormValues>({
    defaultValues: {
      groups: groups.map((group) =>
        group.toAccount
          ? transferTo(group.toAccount.id)
          : (group.category?.id ?? ''),
      ),
      // Entered by hand already: leaving it out is the safe default.
      skip: duplicates.map(() => true),
    },
  });

  // Rows left out per group: a group with none left needs no category.
  const skip = useWatch({ control, name: 'skip' });
  const skippedLines = duplicates
    .filter((_, index) => skip[index])
    .map((duplicate) => duplicate.line);
  const skippedPerGroup = new Map<string, number>();
  duplicates.forEach((duplicate, index) => {
    if (!skip[index]) return;
    const key = groupKey(duplicate.kind, duplicate.source);
    skippedPerGroup.set(key, (skippedPerGroup.get(key) ?? 0) + 1);
  });
  const remaining = (group: (typeof groups)[number]) =>
    group.rows - (skippedPerGroup.get(groupKey(group.kind, group.source)) ?? 0);

  const onSubmit = handleSubmit(async ({ groups: chosen }) => {
    const ids: string[] = [];
    for (const [index, group] of groups.entries()) {
      const value = chosen[index] ?? '';
      if (value !== NEW || remaining(group) === 0) {
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
        // The groups still going in, each still at its index: categories.N
        // in an error is group N.
        categories: groups.flatMap((group, index) => {
          if (remaining(group) === 0) return [];
          const value = ids[index] ?? '';
          const common = { kind: group.kind, source: group.source };
          return [
            value.startsWith(TRANSFER)
              ? {
                  ...common,
                  target: 'transfer' as const,
                  toAccountId: value.slice(TRANSFER.length),
                }
              : { ...common, target: 'category' as const, categoryId: value },
          ];
        }),
        skipLines: skippedLines,
      },
    });
    if (!result.error) return;
    const sent = groups
      .map((group, index) => ({ group, index }))
      .filter(({ group }) => remaining(group) > 0);
    let placed = false;
    for (const detail of toApiError(result.error)?.details ?? []) {
      const at = GROUP_FIELD.exec(detail.field ?? '')?.[1];
      const index = at === undefined ? undefined : sent[Number(at)]?.index;
      if (index === undefined) continue;
      setError(`groups.${index}`, { type: 'server', message: detail.message });
      placed = true;
    }
    if (!placed) {
      setError('root.server', {
        type: 'server',
        message: errorMessage(result.error),
      });
    }
  });

  const total = imported.counts.new - skippedLines.length;

  return (
    <Form onSubmit={onSubmit}>
      {/* Why the last attempt was sent back, e.g. not enough money. */}
      <FormError
        message={errors.root?.server?.message ?? imported.error ?? undefined}
      />

      {duplicates.length > 0 && (
        <section className={styles.duplicates}>
          <h3 className={styles.subtitle}>Возможно, уже есть на счёте</h3>
          <p className={styles.hint}>
            Похожие операции внесены вручную или регулярным платежом: та же
            сумма, разница не больше двух дней.
          </p>
          <ul className={styles.duplicateList} aria-label="Возможные дубли">
            {duplicates.map((duplicate, index) => (
              <li key={duplicate.line} className={styles.duplicate}>
                <label className={styles.check}>
                  <input type="checkbox" {...register(`skip.${index}`)} />
                  Пропустить
                </label>
                <span className={styles.pair}>
                  <span>
                    <strong>
                      {formatSignedMoney(
                        duplicate.amount,
                        duplicate.kind,
                        currency,
                      )}
                    </strong>
                    {' · '}
                    {duplicate.description ?? 'Без описания'} ·{' '}
                    {when(duplicate.occurredAt)}
                  </span>
                  <span className={styles.meta}>
                    Похоже на: {duplicate.similar.label}
                    {duplicate.similar.comment &&
                      ` «${duplicate.similar.comment}»`}{' '}
                    · {when(duplicate.similar.occurredAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.some((group) => remaining(group) > 0) && (
        <ul className={styles.groups} aria-label="Категории из выписки">
          {groups.map((group, index) => {
            const rows = remaining(group);
            if (rows === 0) return null;
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
                key={groupKey(group.kind, group.source)}
                className={styles.group}
              >
                <div className={styles.source}>
                  <span className={styles.name}>{name}</span>
                  <span className={styles.meta}>
                    {kindLabel(group.kind)} · {pluralize(rows, ROWS)}
                    {rows === group.rows &&
                      ` · ${formatMoney(group.total, currency)}`}
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
                  {accounts.length > 0 && (
                    <optgroup label="Перевод между счетами">
                      {accounts.map((account) => (
                        <option key={account.id} value={transferTo(account.id)}>
                          {group.kind === 'income' ? 'Со счёта' : 'На счёт'} «
                          {account.name}»
                        </option>
                      ))}
                    </optgroup>
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
