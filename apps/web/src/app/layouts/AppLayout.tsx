import { Outlet } from 'react-router';
import { Toaster } from '@/shared/ui';
import { AppHeader } from '@/widgets/app-header';
import styles from './AppLayout.module.css';

/** Pages of a signed-in user: the header and the page below it. */
export function AppLayout() {
  return (
    <>
      <AppHeader />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Toaster />
    </>
  );
}
