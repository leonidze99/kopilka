import { Hash } from 'lucide-react';
import { useState } from 'react';
import { type Tag, useListTagsQuery } from '@/entities/tag';
import { DeleteTagButton } from '@/features/tag-delete';
import { RenameTagForm } from '@/features/tag-rename';
import { errorMessage } from '@/shared/lib';
import {
  Chip,
  Dialog,
  EmptyState,
  FormError,
  Panel,
  Skeleton,
} from '@/shared/ui';
import styles from './TagList.module.css';

/**
 * The user's tags, to rename or delete. There is no form for a new one:
 * a tag is made by naming it on a transaction.
 */
export function TagList() {
  const { data: tags = [], error, isLoading } = useListTagsQuery();
  const [editing, setEditing] = useState<Tag>();
  const closeEditor = () => setEditing(undefined);

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
          обошлось по всем категориям.
        </EmptyState>
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
          <RenameTagForm
            tag={editing}
            onSaved={closeEditor}
            footer={<DeleteTagButton tag={editing} onDeleted={closeEditor} />}
          />
        )}
      </Dialog>
    </Panel>
  );
}
