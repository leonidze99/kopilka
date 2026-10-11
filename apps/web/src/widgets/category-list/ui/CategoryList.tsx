import { ChevronRight, Tags } from 'lucide-react';
import { useState } from 'react';
import {
  type Category,
  CategoryAvatar,
  KIND_OPTIONS,
  KIND_TITLES,
  useListCategoriesQuery,
} from '@/entities/category';
import { DeleteCategoryButton } from '@/features/category-delete';
import { RenameCategoryForm } from '@/features/category-rename';
import { errorMessage } from '@/shared/lib';
import { Dialog, EmptyState, FormError, Panel, Skeleton } from '@/shared/ui';
import styles from './CategoryList.module.css';

export function CategoryList() {
  const { data: categories = [], error, isLoading } = useListCategoriesQuery();
  const [editing, setEditing] = useState<Category>();
  const closeEditor = () => setEditing(undefined);

  if (error) return <FormError message={errorMessage(error)} />;

  return (
    <div className={styles.columns}>
      {KIND_OPTIONS.map(({ value: kind }) => {
        const ofKind = categories.filter((category) => category.kind === kind);
        return (
          <Panel
            key={kind}
            title={KIND_TITLES[kind]}
            actions={
              !isLoading && (
                <span className={styles.count}>{ofKind.length}</span>
              )
            }
          >
            {isLoading && <ListSkeleton />}
            {!isLoading && ofKind.length === 0 && (
              <EmptyState icon={<Tags size={22} />} title="Пока пусто" />
            )}
            <ul className={styles.list}>
              {ofKind.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-haspopup="dialog"
                    onClick={() => setEditing(category)}
                  >
                    <CategoryAvatar category={category} size="sm" />
                    <span className={styles.name}>{category.name}</span>
                    <ChevronRight
                      className={styles.chevron}
                      size={18}
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}

      <Dialog open={!!editing} onClose={closeEditor} title="Категория">
        {editing && (
          <RenameCategoryForm
            category={editing}
            onSaved={closeEditor}
            footer={
              <DeleteCategoryButton
                category={editing}
                onDeleted={closeEditor}
              />
            }
          />
        )}
      </Dialog>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className={styles.skeleton} aria-label="Загрузка категорий">
      {[60, 45, 70].map((width) => (
        <div key={width} className={styles.skeletonRow}>
          <Skeleton width={32} height={32} radius={8} />
          <Skeleton width={`${width}%`} />
        </div>
      ))}
    </div>
  );
}
