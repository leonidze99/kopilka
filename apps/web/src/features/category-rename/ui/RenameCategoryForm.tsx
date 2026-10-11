import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { updateCategorySchema } from '@kopilka/shared';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { type Category, useRenameCategoryMutation } from '@/entities/category';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, TextField, toast } from '@/shared/ui';

interface RenameCategoryFormProps {
  category: Category;
  onSaved: () => void;
  /** Extra controls under the submit button, e.g. delete. */
  footer?: ReactNode;
}

/** Only the name: the kind is fixed (see updateCategorySchema). */
export function RenameCategoryForm({
  category,
  onSaved,
  footer,
}: RenameCategoryFormProps) {
  const [renameCategory] = useRenameCategoryMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(updateCategorySchema),
    defaultValues: { name: category.name },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await renameCategory({ id: category.id, ...values });
    if (result.error) {
      // e.g. CONFLICT: another category of this kind has the name.
      applyApiError(result.error, setError, ['name']);
      return;
    }
    toast('Категория переименована');
    onSaved();
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <TextField
        label="Название"
        autoComplete="off"
        error={errors.name?.message}
        {...register('name')}
      />
      <Button type="submit" loading={isSubmitting}>
        Сохранить
      </Button>
      {footer}
    </Form>
  );
}
