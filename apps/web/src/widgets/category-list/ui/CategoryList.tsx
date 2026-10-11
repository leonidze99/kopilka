import {
  KIND_OPTIONS,
  KIND_TITLES,
  useListCategoriesQuery,
} from '@/entities/category';
import { DeleteCategoryButton } from '@/features/category-delete';
import { errorMessage } from '@/shared/lib';
import { FormError, Panel } from '@/shared/ui';
import styles from './CategoryList.module.css';

export function CategoryList() {
  const { data: categories = [], error, isLoading } = useListCategoriesQuery();

  if (error) return <FormError message={errorMessage(error)} />;

  return (
    <div className={styles.columns}>
      {KIND_OPTIONS.map(({ value: kind }) => {
        const ofKind = categories.filter((category) => category.kind === kind);
        return (
          <Panel key={kind} title={KIND_TITLES[kind]}>
            {isLoading && <p className={styles.muted}>Загрузка…</p>}
            {!isLoading && ofKind.length === 0 && (
              <p className={styles.muted}>Пока пусто</p>
            )}
            <ul className={styles.list}>
              {ofKind.map((category) => (
                <li key={category.id} className={styles.item}>
                  <span>{category.name}</span>
                  <DeleteCategoryButton category={category} />
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
