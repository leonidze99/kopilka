import { CreateCategoryForm } from '@/features/category-create';
import { Panel } from '@/shared/ui';
import { CategoryList } from '@/widgets/category-list';
import styles from '../../page.module.css';

export function CategoriesPage() {
  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Категории</h1>
        <p className={styles.subtitle}>
          По ним группируются операции и считаются итоги
        </p>
      </div>
      <div className={styles.columns}>
        <CategoryList />
        <div className={styles.aside}>
          <Panel title="Новая категория">
            <CreateCategoryForm />
          </Panel>
        </div>
      </div>
    </div>
  );
}
