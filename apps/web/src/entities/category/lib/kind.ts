import type { Schemas } from '@/shared/api';

export type TransactionKind = Schemas['TransactionKind'];

export const KIND_OPTIONS = [
  { value: 'expense', label: 'Расход' },
  { value: 'income', label: 'Доход' },
] as const satisfies readonly { value: TransactionKind; label: string }[];

export const KIND_TITLES: Record<TransactionKind, string> = {
  expense: 'Расходы',
  income: 'Доходы',
};
