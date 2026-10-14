import { type Tag, useDeleteTagMutation } from '@/entities/tag';
import { errorMessage } from '@/shared/lib';
import { ConfirmButton, FormError, toast } from '@/shared/ui';

interface DeleteTagButtonProps {
  tag: Tag;
  onDeleted?: () => void;
}

/** The tag goes; its transactions stay, without it. */
export function DeleteTagButton({ tag, onDeleted }: DeleteTagButtonProps) {
  const [deleteTag, { isLoading, error }] = useDeleteTagMutation();

  return (
    <>
      <ConfirmButton
        look="text"
        label={`Удалить тег «${tag.name}»`}
        loading={isLoading}
        onConfirm={async () => {
          const result = await deleteTag(tag.id);
          if (result.error) return;
          toast('Тег удалён');
          onDeleted?.();
        }}
      />
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
