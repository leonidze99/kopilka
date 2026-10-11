import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { type LoginDto, loginSchema } from '@kopilka/shared';
import { useForm } from 'react-hook-form';
import { useLoginMutation } from '@/entities/session';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, TextField } from '@/shared/ui';

/** Navigation after success is up to the route guards: the session changes. */
export function LoginForm() {
  const [login] = useLoginMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginDto>({
    // The same schema the API validates the request with.
    resolver: standardSchemaResolver(loginSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await login(values);
    if (result.error)
      applyApiError(result.error, setError, ['email', 'password']);
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
      <TextField
        label="Пароль"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting}>
        Войти
      </Button>
    </Form>
  );
}
