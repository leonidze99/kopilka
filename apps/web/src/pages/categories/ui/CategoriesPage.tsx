import { CreateCategoryForm } from '@/features/category-create';
import { Panel } from '@/shared/ui';
import { CategoryList } from '@/widgets/category-list';
import styles from '../../page.module.css';

export function CategoriesPage() {
  return (
    <div className={styles.stack}>
      <h1 className={styles.title}>Категории</h1>
      <Panel title="Новая категория">
        <CreateCategoryForm />
      </Panel>
      <CategoryList />
    </div>
  );
}
