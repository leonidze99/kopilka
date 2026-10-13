import { useSelector } from 'react-redux';
import { selectCurrentUser } from '@/entities/session';
import { ChangePasswordForm } from '@/features/change-password';
import { NotificationSettings } from '@/features/notification-settings';
import { Panel } from '@/shared/ui';
import { SessionList } from '@/widgets/session-list';
import styles from '../../page.module.css';

export function SettingsPage() {
  const user = useSelector(selectCurrentUser);

  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <h1 className={styles.title}>Настройки</h1>
        <p className={styles.subtitle}>{user?.email}</p>
      </div>
      <div className={styles.columns}>
        <SessionList />
        <div className={styles.aside}>
          <Panel title="Смена пароля">
            <ChangePasswordForm />
          </Panel>
          <Panel title="Уведомления">
            <NotificationSettings />
          </Panel>
        </div>
      </div>
    </div>
  );
}
