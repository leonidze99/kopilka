import { createHash } from 'node:crypto';
import type {
  ImportColumns,
  ImportDateOrder,
  TransactionKind,
} from '@kopilka/shared';
import { Prisma } from '../generated/prisma/client.js';

/** A statement row read with the user's columns. */
export type ParsedRow =
  | {
      status: 'new';
      /** "2026-10-05 14:30:00", local time as written in the file. */
      localAt: string;
      /** Positive: the direction is in `kind`. */
      amount: string;
      kind: TransactionKind;
      description: string | null;
      /** The bank's category, '' if none. */
      sourceCategory: string;
      /** See baseFingerprint(). */
      fingerprint: string;
    }
  | { status: 'skipped' | 'invalid'; error: string };

const AMOUNT = /^[-+]?\d{1,12}(\.\d{1,2})?$/;
const CURRENCY = /(₽|руб\.?|р\.|rub|rur)$/i;

/**
 * "−1 234,56 ₽" → -1234.56. Takes what statements write: spaces between
 * thousands, a decimal comma or point, a typographic minus, a currency
 * after the number. With both a comma and a point the last one is the
 * decimal separator ("1,234.56" and "1.234,56"). null: not an amount.
 */
export function parseAmount(raw: string): Prisma.Decimal | null {
  let value = raw.replace(/\s/g, '').replace(CURRENCY, '').replace(/[−–]/, '-');
  const decimal = Math.max(value.lastIndexOf(','), value.lastIndexOf('.'));
  if (decimal !== -1) {
    const separator = value[decimal];
    const thousands = separator === ',' ? '.' : ',';
    value = value.replaceAll(thousands, '').replace(',', '.');
  }
  return AMOUNT.test(value) ? new Prisma.Decimal(value) : null;
}

const DATE =
  /^(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/**
 * "05.10.2026 14:30" → "2026-10-05 14:30:00" in the given order of day,
 * month and year; the time is optional. No zone: it is the statement's
 * local time. null: not such a date (31.02 included).
 */
export function parseLocalDateTime(
  raw: string,
  order: ImportDateOrder,
): string | null {
  const match = DATE.exec(raw.trim());
  if (!match) return null;
  const [a, b, c, hours = 0, minutes = 0, seconds = 0] = match
    .slice(1)
    .map((part) => (part === undefined ? undefined : Number(part)));
  const [day, month, rawYear] =
    order === 'dmy' ? [a, b, c] : order === 'ymd' ? [c, b, a] : [b, a, c];
  if (day === undefined || month === undefined || rawYear === undefined) {
    return null;
  }
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  // Date.UTC rolls 31.02 over into March: a real date survives the round trip.
  const date = new Date(
    Date.UTC(year, month - 1, day, hours, minutes, seconds),
  );
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hours ||
    date.getUTCMinutes() !== minutes
  ) {
    return null;
  }
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** A cell for an error message: «…», cut short. */
const quote = (value: string) =>
  `«${value.length > 40 ? `${value.slice(0, 40)}…` : value}»`;

const cellOf = (cells: string[], column: number) =>
  (cells[column] ?? '').trim();

/**
 * The same row in any statement: its date and time, kind, amount and
 * description, case and spacing ignored. Not unique on its own: two
 * coffees for 250 on one day are two transactions. The worker adds the
 * number of the occurrence within the file (a window function over the
 * whole file) and hashes again; that is the fingerprint kept on the
 * transaction.
 */
export function baseFingerprint(
  row: Pick<
    Extract<ParsedRow, { status: 'new' }>,
    'localAt' | 'kind' | 'amount' | 'description'
  >,
): string {
  const description = (row.description ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return createHash('sha256')
    .update([row.localAt, row.kind, row.amount, description].join('|'))
    .digest('hex');
}

export function parseRow(cells: string[], columns: ImportColumns): ParsedRow {
  if (columns.status) {
    const status = cellOf(cells, columns.status.column);
    if (status !== columns.status.value) {
      return { status: 'skipped', error: `Статус ${quote(status)}` };
    }
  }

  const rawDate = cellOf(cells, columns.date);
  const localAt = parseLocalDateTime(rawDate, columns.dateOrder);
  if (!localAt)
    return { status: 'invalid', error: `Не дата: ${quote(rawDate)}` };

  let value: Prisma.Decimal;
  if (columns.amount.type === 'signed') {
    const raw = cellOf(cells, columns.amount.column);
    const amount = parseAmount(raw);
    if (!amount) return { status: 'invalid', error: `Не сумма: ${quote(raw)}` };
    value = amount;
  } else {
    // Money in minus money out; a bank may write either one as negative.
    value = new Prisma.Decimal(0);
    for (const [column, sign] of [
      [columns.amount.income, 1],
      [columns.amount.expense, -1],
    ] as const) {
      const raw = cellOf(cells, column);
      if (raw === '') continue;
      const amount = parseAmount(raw);
      if (!amount)
        return { status: 'invalid', error: `Не сумма: ${quote(raw)}` };
      value = value.plus(amount.abs().times(sign));
    }
  }
  if (value.isZero()) return { status: 'skipped', error: 'Нулевая сумма' };

  const description =
    columns.description === null
      ? ''
      : cellOf(cells, columns.description).replace(/\s+/g, ' ').slice(0, 280);
  const row = {
    localAt,
    amount: value.abs().toFixed(2),
    kind: value.isNegative() ? ('expense' as const) : ('income' as const),
    description: description || null,
  };
  return {
    status: 'new',
    ...row,
    sourceCategory:
      columns.category === null
        ? ''
        : cellOf(cells, columns.category).slice(0, 64),
    fingerprint: baseFingerprint(row),
  };
}
