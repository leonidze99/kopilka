import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { type RegisterDto, registerSchema } from '@kopilka/shared';
import { useForm } from 'react-hook-form';
import { useRegisterMutation } from '@/entities/session';
import { applyApiError } from '@/shared/lib';
import { Button, Form, FormError, TextField } from '@/shared/ui';

/** Signs the user in right away; the route guards take it from there. */
export function RegisterForm() {
  const [registerUser] = useRegisterMutation();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterDto>({
    resolver: standardSchemaResolver(registerSchema),
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await registerUser(values);
    // e.g. CONFLICT with details[0].field === "email" lands under the input.
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
        autoComplete="new-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" loading={isSubmitting}>
        Зарегистрироваться
      </Button>
    </Form>
  );
}
