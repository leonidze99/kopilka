import type { Transaction } from '@kopilka/shared';

/**
 * The export format: semicolon-separated, comma as the decimal mark and a
 * UTF-8 byte order mark — what Excel in a Russian locale opens correctly
 * by double-click. It is also what the import understands, so a file taken
 * out of Kopilka can be fed back into it.
 */

/** Excel reads UTF-8 without it as the system codepage: Привет -> Ïðèâåò. */
export const CSV_BOM = '﻿';

const SEPARATOR = ';';
/** Excel on Windows wants CRLF; everything else accepts it. */
const EOL = '\r\n';

/**
 * One line. A field is quoted when it holds the separator, a quote or a
 * line break — the quotes inside it doubled, as RFC 4180 has it.
 */
export function csvLine(fields: readonly string[]): string {
  return fields.map(quote).join(SEPARATOR) + EOL;
}

function quote(field: string): string {
  if (!/[";\r\n]/.test(field)) return field;
  return `"${field.replaceAll('"', '""')}"`;
}

/** 1234.50 -> "1234,50": a number for a spreadsheet in a Russian locale. */
export const csvAmount = (amount: string): string => amount.replace('.', ',');

/**
 * "13.10.2026 15:30" in the reader's own time zone: the file should say
 * what the screen said, not UTC.
 */
export function csvDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('day')}.${value('month')}.${value('year')} ${value('hour')}:${value('minute')}`;
}

/** Columns of the export, in order. */
export const TRANSACTION_CSV_HEADER = [
  'Дата',
  'Тип',
  'Категория',
  'Счёт',
  'Счёт назначения',
  'Сумма',
  'Комментарий',
] as const;

const TYPE_NAMES = {
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
} as const;

/**
 * One transaction as the columns above: a line, or a line per part of a
 * split one. A spreadsheet then sums a category right, and the import
 * reads the file back as transactions it can categorize.
 */
export function transactionCsvRows(
  transaction: Transaction,
  timeZone: string,
): string[][] {
  const line = (category: string, toAccount: string, amount: string) => [
    csvDateTime(transaction.occurredAt, timeZone),
    TYPE_NAMES[transaction.type],
    category,
    transaction.account.name,
    toAccount,
    csvAmount(amount),
    transaction.comment ?? '',
  ];

  if (transaction.type === 'transfer') {
    return [line('', transaction.toAccount.name, transaction.amount)];
  }
  if (transaction.category) {
    return [line(transaction.category.name, '', transaction.amount)];
  }
  return transaction.splits.map((split) =>
    line(split.category.name, '', split.amount),
  );
}
