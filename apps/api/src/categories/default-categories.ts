/**
 * What a new account starts with, so the first transaction can be recorded
 * without setting anything up first (registration creates them in one
 * transaction with the user and the starting account).
 *
 * The order matters: a category takes its colour from its position among
 * the categories of its kind, and the palette holds eight. Six expense
 * categories leave room for a couple of the user's own in colour.
 */
export const DEFAULT_CATEGORIES = [
  { kind: 'expense', name: 'Продукты' },
  { kind: 'expense', name: 'Кафе' },
  { kind: 'expense', name: 'Транспорт' },
  { kind: 'expense', name: 'Жильё' },
  { kind: 'expense', name: 'Здоровье' },
  { kind: 'expense', name: 'Развлечения' },
  { kind: 'income', name: 'Зарплата' },
  { kind: 'income', name: 'Подработка' },
] as const satisfies { kind: 'income' | 'expense'; name: string }[];
