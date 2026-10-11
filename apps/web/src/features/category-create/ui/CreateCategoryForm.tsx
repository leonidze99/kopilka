import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { createCategorySchema } from '@kopilka/shared';
import { Controller, useForm } from 'react-hook-form';
import { KIND_OPTIONS, useCreateCategoryMutation } from '@/entities/category';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, Segmented, TextField } from '@/shared/ui';

export function CreateCategoryForm() {
  const [createCategory] = useCreateCategoryMutation();
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(createCategorySchema),
    defaultValues: { kind: 'expense' as const, name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await createCategory(values);
    if (result.error) {
      // e.g. CONFLICT with details[0].field === "name" lands under the input.
      applyApiError(result.error, setError, ['kind', 'name']);
      return;
    }
    // Keep the kind: categories are usually added several of a kind at once.
    reset({ kind: values.kind, name: '' });
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <Controller
        control={control}
        name="kind"
        render={({ field }) => (
          <Segmented
            label="Тип категории"
            options={KIND_OPTIONS}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <TextField
        label="Название"
        placeholder="Например, Продукты"
        error={errors.name?.message}
        {...register('name')}
      />
      <Button type="submit" loading={isSubmitting}>
        Добавить категорию
      </Button>
    </Form>
  );
}
