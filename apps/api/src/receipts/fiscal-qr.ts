import { fromKopecks, type ReceiptQr, toKopecks } from '@kopilka/shared';

/**
 * The QR code of a Russian cash receipt (ФНС format), as a query string:
 *   t=20261014T1630&s=1000.00&fn=7380440700076549&i=41406&fp=2671185794&n=1
 * t — when, the store's local time, seconds optional; s — the total;
 * fn, i, fp — the fiscal drive, document and sign (identify the receipt
 * at the tax service); n — the kind of operation.
 */
const TIME = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/;

/**
 * n, from the seller's side: 1 приход (the buyer paid) and 4 возврат
 * расхода are money out of the user's pocket; 2 возврат прихода (a refund)
 * and 3 расход (the seller paid, e.g. for scrap) are money in.
 */
const TYPES: Record<string, ReceiptQr['type']> = {
  '1': 'expense',
  '2': 'income',
  '3': 'income',
  '4': 'expense',
};

/** What a receipt QR says, or undefined for any other QR code. */
export function parseFiscalQr(text: string): ReceiptQr | undefined {
  const params = new URLSearchParams(text.trim());
  const time = TIME.exec(params.get('t') ?? '');
  const total = params.get('s') ?? '';
  // Without its fiscal fields a "t=…&s=…" is not a receipt, only alike.
  if (!time || !params.get('fn') || !params.get('fp')) return undefined;

  const [, year, month, day, hour, minute] = time.map(Number) as number[];
  const date = new Date(Date.UTC(year!, month! - 1, day, hour, minute));
  // Date.UTC rolls 31.02 over to 03.03: a real date reads back the same.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day ||
    hour! > 23 ||
    minute! > 59
  ) {
    return undefined;
  }

  const kopecks = toKopecks(total);
  if (!(kopecks > 0)) return undefined;

  const type = TYPES[params.get('n') ?? '1'];
  if (!type) return undefined;

  return {
    // The wall time as printed, for <input type="datetime-local">: the
    // store's zone is not in the code, the user's is the best guess.
    occurredAt: date.toISOString().slice(0, 16),
    amount: fromKopecks(kopecks),
    type,
  };
}
