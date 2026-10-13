import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { resetPasswordSchema } from '@kopilka/shared';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { useResetPasswordMutation } from '@/entities/session';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, TextField, toast } from '@/shared/ui';
import styles from './ResetPasswordForm.module.css';

interface ResetPasswordFormProps {
  /** The one-time token out of the emailed link. */
  token: string;
}

/**
 * Sets a new password with the token from the link. The API ends every
 * session of the account, so afterwards the user signs in — here, too:
 * the reset does not hand out a session of its own.
 */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const navigate = useNavigate();
  const [resetPassword] = useResetPasswordMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: standardSchemaResolver(resetPasswordSchema),
    // The token is not a field the user fills; it rides along from the URL.
    defaultValues: { token, newPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await resetPassword(values);
    if (result.error) {
      applyApiError(result.error, setError, ['newPassword']);
      return;
    }
    toast('Пароль изменён, войдите с новым паролем');
    navigate('/login', { replace: true });
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <TextField
        label="Новый пароль"
        type="password"
        // Lets a password manager offer a strong one and save it.
        autoComplete="new-password"
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <p className={styles.hint}>
        Не короче 8 символов. На всех устройствах будет выполнен выход.
      </p>
      <Button type="submit" loading={isSubmitting}>
        Сохранить пароль
      </Button>
    </Form>
  );
}
