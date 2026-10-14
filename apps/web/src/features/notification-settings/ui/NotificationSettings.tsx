import { useSelector } from 'react-redux';
import {
  selectCurrentUser,
  useSetNotificationsMutation,
} from '@/entities/session';
import { errorMessage } from '@/shared/lib';
import { FormError, Switch } from '@/shared/ui';

/**
 * The one setting there is: mail when a budget of the month is overspent.
 * The switch follows the user in the session, so it is right after a
 * reload without a request of its own.
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
      {error && <FormError message={errorMessage(error)} />}
    </>
  );
}
