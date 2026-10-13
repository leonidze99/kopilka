import { Link, useSearchParams } from 'react-router';
import { ResetPasswordForm } from '@/features/reset-password';
import { CenteredCard } from '@/shared/ui';
import styles from './ResetPasswordPage.module.css';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <CenteredCard
      title="Смена пароля"
      subtitle={
        token ? 'Придумайте пароль, который ещё не использовали.' : undefined
      }
      footer={<Link to="/login">Вернуться к входу</Link>}
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        // A link cut in half by a mail client, or a hand-typed address.
        <p className={styles.broken}>
          В ссылке нет кода. Откройте ссылку из письма целиком или{' '}
          <Link to="/forgot-password">запросите новую</Link>.
        </p>
      )}
    </CenteredCard>
  );
}
