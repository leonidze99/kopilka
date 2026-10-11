import { useLogoutMutation } from '@/entities/session';
import { Button } from '@/shared/ui';

export function LogoutButton() {
  const [logout, { isLoading }] = useLogoutMutation();
  return (
    <Button variant="secondary" loading={isLoading} onClick={() => logout()}>
      Выйти
    </Button>
  );
}
