import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { type ForgotPasswordDto, forgotPasswordSchema } from '@kopilka/shared';
import { useForm } from 'react-hook-form';
import { useForgotPasswordMutation } from '@/entities/session';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, TextField } from '@/shared/ui';

interface ForgotPasswordFormProps {
  /** Called with the normalized address once the request went through. */
  onSent: (email: string) => void;
}

/**
 * Asks the API to mail a link. Success says nothing about whether the
 * address is registered — the API answers the same either way, so the form
 * cannot be used to find out who has an account.
 */
export function ForgotPasswordForm({ onSent }: ForgotPasswordFormProps) {
  const [forgotPassword] = useForgotPasswordMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordDto>({
    resolver: standardSchemaResolver(forgotPasswordSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await forgotPassword(values);
    if (result.error) {
      applyApiError(result.error, setError, ['email']);
      return;
    }
    onSent(values.email);
  });

  return (
    <Form onSubmit={onSubmit}>
      <FormError message={errors.root?.server?.message} />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register('email')}
      />
      <Button type="submit" loading={isSubmitting}>
        Отправить ссылку
      </Button>
    </Form>
  );
}
