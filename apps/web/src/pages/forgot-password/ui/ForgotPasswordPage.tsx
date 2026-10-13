import { useState } from 'react';
import { Link } from 'react-router';
import { ForgotPasswordForm } from '@/features/forgot-password';
import { CenteredCard } from '@/shared/ui';
import styles from './ForgotPasswordPage.module.css';

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <CenteredCard
      title="Забыли пароль?"
      subtitle={
        sentTo ? undefined : 'Пришлём на почту ссылку для смены пароля.'
      }
      footer={<Link to="/login">Вернуться к входу</Link>}
    >
      {sentTo ? (
        <p className={styles.sent}>
          Если адрес <b>{sentTo}</b> зарегистрирован, письмо со ссылкой уже в
          пути. Ссылка одноразовая. Письма нет — посмотрите в папке со спамом.
        </p>
      ) : (
        <ForgotPasswordForm onSent={setSentTo} />
      )}
    </CenteredCard>
  );
}
