import { useSelector } from 'react-redux';
import { NavLink } from 'react-router';
import { selectCurrentUser } from '@/entities/session';
import { LogoutButton } from '@/features/logout';
import styles from './AppHeader.module.css';

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.link} ${styles.active}` : styles.link;

export function AppHeader() {
  const user = useSelector(selectCurrentUser);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <span className={styles.logo}>Копилка</span>
        <nav className={styles.nav} aria-label="Основное меню">
          <NavLink to="/" end className={navClass}>
            Операции
          </NavLink>
          <NavLink to="/categories" className={navClass}>
            Категории
          </NavLink>
        </nav>
        <div className={styles.user}>
          <span className={styles.email}>{user?.email}</span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
