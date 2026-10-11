import { LogOut } from 'lucide-react';
import { useLogoutMutation } from '@/entities/session';
import { Button } from '@/shared/ui';

export function LogoutButton() {
  const [logout, { isLoading }] = useLogoutMutation();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Выйти"
      title="Выйти"
      loading={isLoading}
      onClick={() => logout()}
    >
      <LogOut size={18} />
    </Button>
  );
}
