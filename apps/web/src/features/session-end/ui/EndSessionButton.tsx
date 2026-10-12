import {
  type AuthSession,
  useEndOtherSessionsMutation,
  useEndSessionMutation,
} from '@/entities/session';
import { errorMessage } from '@/shared/lib';
import { Button, FormError, toast } from '@/shared/ui';

/**
 * Signs one other device out. One click, no confirmation: nothing is
 * lost, the device can sign in again.
 */
export function EndSessionButton({ session }: { session: AuthSession }) {
  const [end, { isLoading, error }] = useEndSessionMutation();
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        loading={isLoading}
        aria-label={`Завершить сеанс: ${session.device}`}
        onClick={async () => {
          const result = await end(session.id);
          if (!result.error) toast('Сеанс завершён');
        }}
      >
        Завершить
      </Button>
      <FormError message={error && errorMessage(error)} />
    </>
  );
}

export function EndOtherSessionsButton() {
  const [endOthers, { isLoading, error }] = useEndOtherSessionsMutation();
  return (
    <>
      <Button
        variant="secondary"
        loading={isLoading}
        onClick={async () => {
          const result = await endOthers();
          if (!result.error) toast('Выполнен выход на остальных устройствах');
        }}
      >
        Выйти на всех других устройствах
      </Button>
      <FormError message={error && errorMessage(error)} />
    </>
  );
}
