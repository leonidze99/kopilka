import { useSelector } from 'react-redux';
import {
  selectCurrentUser,
  useSetNotificationsMutation,
} from '@/entities/session';
import { errorMessage } from '@/shared/lib';
import { FormError, Switch } from '@/shared/ui';

/**
 * The letters: about an overspent budget, a recurring payment that could
 * not be made, a sign-in from a new device. The switches follow the user in the session, so they
 * are right after a reload without a request of their own.
 */
export function NotificationSettings() {
  const user = useSelector(selectCurrentUser);
  const [setNotifications, { error, isLoading }] =
    useSetNotificationsMutation();

  return (
    <>
      <Switch
        label="Письма о перерасходе"
        description="Когда траты перешли лимит: по категории — одно письмо в месяц, по тегу — одно на каждый лимит"
        checked={user?.budgetAlerts ?? false}
        disabled={isLoading || !user}
        onChange={(event) =>
          void setNotifications({ budgetAlerts: event.target.checked })
        }
      />
      <Switch
        label="Письма о пропущенных платежах"
        description="Когда регулярный платёж не прошёл: на счёте не хватило денег или нет курса ЦБ"
        checked={user?.recurringAlerts ?? false}
        disabled={isLoading || !user}
        onChange={(event) =>
          void setNotifications({ recurringAlerts: event.target.checked })
        }
      />
      <Switch
        label="Письма о входе с нового устройства"
        description="Когда в аккаунт входят из браузера, из которого раньше не входили"
        checked={user?.loginAlerts ?? false}
        disabled={isLoading || !user}
        onChange={(event) =>
          void setNotifications({ loginAlerts: event.target.checked })
        }
      />
      {error && <FormError message={errorMessage(error)} />}
    </>
  );
}
