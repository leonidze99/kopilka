import type { Schemas } from '@/shared/api';

export type AccountType = Schemas['AccountType'];

export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'card', label: 'Карта' },
  { value: 'cash', label: 'Наличные' },
  { value: 'savings', label: 'Накопления' },
] as const satisfies readonly { value: AccountType; label: string }[];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  card: 'Карта',
  cash: 'Наличные',
  savings: 'Накопления',
};
