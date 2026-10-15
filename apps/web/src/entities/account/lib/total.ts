import { formatMoney } from '@/shared/lib';
import type { AccountList } from '../api/account-api';

/**
 * All the accounts together, in the base currency: "≈" when some balance
 * was converted at today's rate, a dash when a rate was missing (the API
 * then gives no total rather than one that leaves an account out).
 */
export function formatAccountsTotal(
  list: AccountList,
  baseCurrency: string,
): string {
  if (list.total === null) return '—';
  // Only money converted makes it approximate: an empty account in another
  // currency (an archived one, say) adds nothing.
  const converted = list.items.some(
    (account) =>
      account.currency !== baseCurrency && account.balance !== '0.00',
  );
  return `${converted ? '≈ ' : ''}${formatMoney(list.total, baseCurrency)}`;
}
