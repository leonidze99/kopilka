import { useMeQuery } from '@/entities/session';
import { LogoutButton } from '@/features/logout';
import { errorMessage } from '@/shared/lib';
import { CenteredCard, FormError } from '@/shared/ui';

/** Placeholder until the first finance features exist. */
export function HomePage() {
  // An authenticated request: exercises the bearer token and, once the
  // access token expires, the transparent refresh.
  const { data: user, error } = useMeQuery();

  return (
    <CenteredCard title="Копилка" footer={<LogoutButton />}>
      {error ? (
        <FormError message={errorMessage(error)} />
      ) : (
        <p>{user ? `Вы вошли как ${user.email}` : 'Загрузка…'}</p>
      )}
    </CenteredCard>
  );
}
