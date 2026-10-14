import { CreateCategoryForm } from '@/features/category-create';
import { Panel } from '@/shared/ui';
import { CategoryList } from '@/widgets/category-list';
import { TagList } from '@/widgets/tag-list';
import styles from '../../page.module.css';

export function CategoriesPage() {
  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Категории и теги</h1>
        <p className={styles.subtitle}>
          По категориям группируются операции и считаются итоги, теги собирают
          операции разных категорий
        </p>
      </div>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <CategoryList />
          <TagList />
        </div>
        <div className={styles.aside}>
          <Panel title="Новая категория">
            <CreateCategoryForm />
          </Panel>
        </div>
      </div>
    </div>
  );
}
