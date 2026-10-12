import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { changePasswordSchema } from '@kopilka/shared';
import { useForm } from 'react-hook-form';
import { useChangePasswordMutation } from '@/entities/session';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, TextField, toast } from '@/shared/ui';
import styles from './ChangePasswordForm.module.css';

/**
 * The current password and a new one. The API signs every other device
 * out: whoever knew the old password loses the account with it.
 */
export function ChangePasswordForm() {
  const [changePassword] = useChangePasswordMutation();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await changePassword(values);
    if (result.error) {
      applyApiError(result.error, setError, ['currentPassword', 'newPassword']);
      return;
    }
    reset();
    toast('Пароль изменён, на других устройствах выполнен выход');
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <TextField
        label="Текущий пароль"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <TextField
        label="Новый пароль"
        type="password"
        // Lets a password manager offer a strong one and save it.
        autoComplete="new-password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <p className={styles.hint}>
        Не короче 8 символов. После смены на остальных устройствах нужно будет
        войти заново.
      </p>
      <Button type="submit" loading={isSubmitting}>
        Сменить пароль
      </Button>
    </Form>
  );
}
