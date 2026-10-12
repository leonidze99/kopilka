import { ArrowLeftRight, Repeat, Tags, Wallet } from 'lucide-react';
import { useSelector } from 'react-redux';
import { Link, NavLink } from 'react-router';
import { selectCurrentUser } from '@/entities/session';
import { LogoutButton } from '@/features/logout';
import { ThemeToggle } from '@/features/theme-toggle';
import { Logo } from '@/shared/ui';
import styles from './AppHeader.module.css';

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.link} ${styles.active}` : styles.link;

export function AppHeader() {
  const user = useSelector(selectCurrentUser);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.home} aria-label="Копилка, на главную">
          <Logo />
        </Link>
        {/* On phones the same nav becomes a tab bar at the bottom. */}
        <nav className={styles.nav} aria-label="Основное меню">
          <NavLink to="/" end className={navClass}>
            <ArrowLeftRight size={18} aria-hidden />
            Операции
          </NavLink>
          <NavLink to="/accounts" className={navClass}>
            <Wallet size={18} aria-hidden />
            Счета
          </NavLink>
          <NavLink to="/recurring" className={navClass}>
            <Repeat size={18} aria-hidden />
            Регулярные
          </NavLink>
          <NavLink to="/categories" className={navClass}>
            <Tags size={18} aria-hidden />
            Категории
          </NavLink>
        </nav>
        <div className={styles.user}>
          <ThemeToggle />
          {user && (
            <span className={styles.account} title={user.email}>
              <span className={styles.initial} aria-hidden>
                {user.email.charAt(0).toUpperCase()}
              </span>
              <span className={styles.email}>{user.email}</span>
            </span>
          )}
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
