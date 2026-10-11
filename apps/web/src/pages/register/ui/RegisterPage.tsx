import { Link } from 'react-router';
import { RegisterForm } from '@/features/register';
import { CenteredCard } from '@/shared/ui';

export function RegisterPage() {
  return (
    <CenteredCard
      title="Регистрация"
      subtitle="Учёт доходов и расходов без таблиц и лишнего."
      footer={
        <>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </>
      }
    >
      <RegisterForm />
    </CenteredCard>
  );
}
