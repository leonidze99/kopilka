import { Hash } from 'lucide-react';
import { useState } from 'react';
import { type Tag, type TagBudget, useListTagsQuery } from '@/entities/tag';
import { useBaseCurrency } from '@/entities/session';
import { TagBudgetForm } from '@/features/tag-budget';
import { DeleteTagButton } from '@/features/tag-delete';
import { RenameTagForm } from '@/features/tag-rename';
import { errorMessage, formatMoney } from '@/shared/lib';
import {
  Chip,
  Dialog,
  EmptyState,
  FormError,
  Panel,
  Skeleton,
  UsageBar,
  UsageRemaining,
} from '@/shared/ui';
import styles from './TagList.module.css';

/**
 * The user's tags, to rename, budget or delete. There is no form for a
 * new one: a tag is made by naming it on a transaction. Tags with a budget
 * come first, each with what it has cost so far.
 */
export function TagList() {
  const { data: tags = [], error, isLoading } = useListTagsQuery();
  const [editing, setEditing] = useState<Tag>();
  const closeEditor = () => setEditing(undefined);
  const budgeted = tags.filter(
    (tag): tag is Tag & { budget: TagBudget } => tag.budget !== null,
  );

  return (
    <Panel
      title="Теги"
      actions={
        !isLoading && <span className={styles.count}>{tags.length}</span>
      }
    >
      {error && <FormError message={errorMessage(error)} />}
      {isLoading && (
        <div className={styles.chips} aria-label="Загрузка тегов">
          {[70, 50, 90].map((width) => (
            <Skeleton key={width} width={width} height={28} radius={14} />
          ))}
        </div>
      )}
      {!isLoading && !error && tags.length === 0 && (
        <EmptyState icon={<Hash size={22} />} title="Тегов пока нет">
          Их ставят на операции — «Отпуск», «Ремонт», — чтобы видеть, во что это
          обошлось по всем категориям. Тегу можно задать бюджет.
        </EmptyState>
      )}
      {budgeted.length > 0 && (
        <ul className={styles.budgets} aria-label="Бюджеты тегов">
          {budgeted.map((tag) => (
            <li key={tag.id}>
              <BudgetRow tag={tag} onOpen={() => setEditing(tag)} />
            </li>
          ))}
        </ul>
      )}
      {tags.length > 0 && (
        <ul className={styles.chips} aria-label="Теги">
          {tags.map((tag) => (
            <li key={tag.id}>
              <Chip onClick={() => setEditing(tag)}>{tag.name}</Chip>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!editing} onClose={closeEditor} title="Тег">
        {editing && (
          <div className={styles.editor}>
            <RenameTagForm tag={editing} onSaved={closeEditor} />
            <TagBudgetForm tag={editing} onDone={closeEditor} />
            <div className={styles.delete}>
              <DeleteTagButton tag={editing} onDeleted={closeEditor} />
            </div>
          </div>
        )}
      </Dialog>
    </Panel>
  );
}

function BudgetRow({
  tag,
  onOpen,
}: {
  tag: Tag & { budget: TagBudget };
  onOpen: () => void;
}) {
  const currency = useBaseCurrency();
  const { budget } = tag;
  return (
    <button
      type="button"
      className={styles.row}
      aria-haspopup="dialog"
      onClick={onOpen}
    >
      <span className={styles.head}>
        <span className={styles.name}>
          <Hash size={14} aria-hidden />
          {tag.name}
        </span>
        <span className={styles.amounts}>
          {formatMoney(budget.spent, currency)}
          <span className={styles.of}>
            {' '}
            из {formatMoney(budget.limit, currency)}
          </span>
        </span>
      </span>
      <UsageBar spent={budget.spent} limit={budget.limit} />
      <UsageRemaining remaining={budget.remaining} currency={currency} />
    </button>
  );
}
