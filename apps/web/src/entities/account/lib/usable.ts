import type { Account } from '../api/account-api';

/**
 * The accounts a form may offer: those in use, plus archived ones the
 * record being edited is already on (its history stays editable, but no
 * new money goes to an archived account — the API refuses that too).
 */
export function usableAccounts(
  accounts: Account[],
  kept: (string | null | undefined)[] = [],
): Account[] {
  return accounts.filter(
    (account) => account.archivedAt === null || kept.includes(account.id),
  );
}
