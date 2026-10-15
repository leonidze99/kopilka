import type { Currency } from '@kopilka/shared';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from './session-slice';

/**
 * The currency totals, budgets and analytics are in. The rouble until the
 * user has loaded: every page that shows money is behind sign-in anyway.
 */
export function useBaseCurrency(): Currency {
  return useSelector(selectCurrentUser)?.baseCurrency ?? 'RUB';
}
