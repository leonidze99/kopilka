import { type Category, useDeleteCategoryMutation } from '@/entities/category';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DeleteCategoryButtonProps {
  category: Category;
  onDeleted?: () => void;
}

export function DeleteCategoryButton({
  category,
  onDeleted,
}: DeleteCategoryButtonProps) {
  const [deleteCategory, { isLoading, error }] = useDeleteCategoryMutation();

  return (
    <>
      <ConfirmButton
        look="text"
        label={`Удалить категорию «${category.name}»`}
        loading={isLoading}
        onConfirm={async () => {
          const result = await deleteCategory(category.id);
          if (result.error) return;
          toast('Категория удалена');
          onDeleted?.();
        }}
      />
      {/* e.g. CATEGORY_IN_USE: the category still has transactions. */}
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
