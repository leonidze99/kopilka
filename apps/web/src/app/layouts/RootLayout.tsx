import { Outlet } from 'react-router';
import { Toaster } from '@/shared/ui';

/**
 * Wraps every route, signed in or not, so that a toast raised just before
 * a redirect is still shown on the page it lands on — "сохранили пароль,
 * войдите заново" is raised on /reset-password and read on /login.
 */
export function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}
