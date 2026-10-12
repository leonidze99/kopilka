import type { ImportColumns, ImportDateOrder } from '@kopilka/shared';

export interface Suggestion {
  /** A known bank format, or null for a guess by the header names. */
  preset: string | null;
  columns: ImportColumns | null;
}

const normalize = (header: string) => header.trim().toLowerCase();

/**
 * T-Bank (Tinkoff) CSV: Windows-1251, ";" and a decimal comma, local
 * Moscow time "05.10.2026 14:30:00". "Сумма платежа" is in the currency
 * of the card (a payment abroad has its own "Сумма операции"); declined
 * payments are in the file too, with a status other than OK.
 */
function tbank(headers: string[]): ImportColumns | null {
  const index = (name: string) => headers.map(normalize).indexOf(name);
  const date = index('дата операции');
  const status = index('статус');
  const amount = index('сумма платежа');
  const category = index('категория');
  const description = index('описание');
  if ([date, status, amount, category, description].includes(-1)) return null;
  return {
    date,
    dateOrder: 'dmy',
    amount: { type: 'signed', column: amount },
    description,
    category,
    status: { column: status, value: 'OK' },
  };
}

const find = (headers: string[], pattern: RegExp) => {
  const index = headers.findIndex((header) => pattern.test(normalize(header)));
  return index === -1 ? null : index;
};

/** 2026-10-05 is year first; anything else is read as day first. */
const guessDateOrder = (sample: string[]): ImportDateOrder =>
  sample.some((value) => /^\s*\d{4}[-./]/.test(value)) ? 'ymd' : 'dmy';

/**
 * Known formats by their headers; otherwise a guess by header names that
 * the user corrects. null columns: not even a date and an amount found.
 */
export function suggestColumns(
  headers: string[],
  sample: string[][],
): Suggestion {
  const known = tbank(headers);
  if (known) return { preset: 'tbank', columns: known };

  const date = find(headers, /дата|date/);
  const amount = find(headers, /сумма|amount|sum/);
  if (date === null || amount === null) return { preset: null, columns: null };
  return {
    preset: null,
    columns: {
      date,
      dateOrder: guessDateOrder(sample.map((row) => row[date] ?? '')),
      amount: { type: 'signed', column: amount },
      description: find(
        headers,
        /описание|назначение|комментарий|description|memo|payee/,
      ),
      category: find(headers, /категория|category/),
      status: null,
    },
  };
}
