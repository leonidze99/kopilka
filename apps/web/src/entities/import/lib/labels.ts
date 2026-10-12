import type { Import } from '../api/import-api';

export const IMPORT_STATUS_LABELS: Record<Import['status'], string> = {
  uploading: 'Загружается',
  uploaded: 'Нужно выбрать колонки',
  parsing: 'Разбираем файл',
  ready: 'Ждёт подтверждения',
  importing: 'Импортируем',
  done: 'Импортирована',
  failed: 'Не удалось обработать',
};

/** Bank formats the API recognises by the headers. */
export const PRESET_NAMES: Record<string, string> = {
  tbank: 'Т-Банк',
};

export const ROWS: readonly [string, string, string] = [
  'строка',
  'строки',
  'строк',
];

export const OPERATIONS: readonly [string, string, string] = [
  'операция',
  'операции',
  'операций',
];

/** How a column is called on screen: its header, or its number. */
export const columnName = (headers: string[], index: number) =>
  headers[index] || `Колонка ${index + 1}`;
