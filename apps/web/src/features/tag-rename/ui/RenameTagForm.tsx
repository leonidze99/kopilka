import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { renameTagSchema } from '@kopilka/shared';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { type Tag, useRenameTagMutation } from '@/entities/tag';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, TextField, toast } from '@/shared/ui';

interface RenameTagFormProps {
  tag: Tag;
  onSaved: () => void;
  /** Extra controls under the submit button, e.g. delete. */
  footer?: ReactNode;
}

export function RenameTagForm({ tag, onSaved, footer }: RenameTagFormProps) {
  const [renameTag] = useRenameTagMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(renameTagSchema),
    defaultValues: { name: tag.name },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await renameTag({ id: tag.id, ...values });
    if (result.error) {
      // e.g. CONFLICT: another tag has the name.
      applyApiError(result.error, setError, ['name']);
      return;
    }
    toast('Тег переименован');
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
