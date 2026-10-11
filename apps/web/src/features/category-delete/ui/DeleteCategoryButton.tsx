import { type Category, useDeleteCategoryMutation } from '@/entities/category';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton } from '@/shared/ui';
import styles from './DeleteCategoryButton.module.css';

/**
 * Two cells of the parent grid: the button, and the error under the whole
 * row — it is too long to fit next to the category name.
 */
export function DeleteCategoryButton({ category }: { category: Category }) {
  const [deleteCategory, { isLoading, error }] = useDeleteCategoryMutation();

  return (
    <>
      <ConfirmButton
        label={`Удалить категорию «${category.name}»`}
        loading={isLoading}
        onConfirm={() => deleteCategory(category.id)}
      />
      {/* e.g. CATEGORY_IN_USE: the category still has transactions. */}
      {error && (
        <p className={styles.error} role="alert">
          {errorMessage(error)}
        </p>
      )}
    </>
  );
}
