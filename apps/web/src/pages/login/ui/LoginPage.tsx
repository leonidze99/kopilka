import { Link } from 'react-router';
import { LoginForm } from '@/features/login';
import { CenteredCard } from '@/shared/ui';

export function LoginPage() {
  return (
    <CenteredCard
      title="Вход в Копилку"
      footer={
        <>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </>
      }
    >
      <LoginForm />
    </CenteredCard>
  );
}
