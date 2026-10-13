import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { type RegisterDto, registerSchema } from '@kopilka/shared';
import { type Resolver, useForm } from 'react-hook-form';
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
    // The schema's input and output differ by the defaulted time zone,
    // which is not a field of the form; the same cast as in the other
    // forms over a schema that normalizes its input.
    resolver: standardSchemaResolver(registerSchema) as unknown as Resolver<
      RegisterDto,
      unknown,
      RegisterDto
    >,
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await registerUser({
      ...values,
      // Not a field the user fills: the account keeps the zone so that a
      // background job knows which month a budget alert is about.
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
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
