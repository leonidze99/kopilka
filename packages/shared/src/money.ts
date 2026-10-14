import { z } from 'zod';

/**
 * Money travels as a decimal string ("1234.56"), never as a JS number:
 * binary floats cannot represent most decimal fractions exactly
 * (0.1 + 0.2 !== 0.3). Up to 12 integer digits: fits numeric(14,2).
 */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;
const SIGNED_AMOUNT_PATTERN = /^-?\d{1,12}(\.\d{1,2})?$/;

/**
 * Accepts what people type: "1 234,5" is read as "1234.5". `\s` also
 * matches the non-breaking space that number formatting inserts, and the
 * typographic minus counts as a minus.
 */
const normalize = (value: string) =>
  value.replace(/\s/g, '').replace(',', '.').replace('−', '-');

/** An amount of a transaction: positive, the direction comes from its kind. */
export const amountSchema = z
  .string()
  .meta({
    description:
      'Positive decimal with up to 2 fraction digits, e.g. "1234.56"',
    example: '1234.56',
  })
  .transform(normalize)
  .pipe(
    z
      .string()
      .regex(
        AMOUNT_PATTERN,
        'Сумма — число, не больше двух знаков после запятой',
      )
      .refine((value) => Number(value) > 0, {
        message: 'Сумма должна быть больше нуля',
        // Not a number at all: "greater than zero" would only add noise.
        // Not `abort` on the pattern: an aborted field stops the checks of
        // the objects around it too, `when` included (a split transaction
        // checks its parts with one).
        when: ({ issues }) => issues.length === 0,
      }),
  );

/** A balance: may be zero or negative (a credit card owes money). */
export const signedAmountSchema = z
  .string()
  .meta({
    description: 'Decimal with up to 2 fraction digits, e.g. "-1234.56"',
    example: '-1234.56',
  })
  .transform(normalize)
  .pipe(
    z
      .string()
      .regex(
        SIGNED_AMOUNT_PATTERN,
        'Сумма — число, не больше двух знаков после запятой',
      ),
  );

/**
 * "1234.5" -> 123450: an amount in whole kopecks, for adding amounts up
 * exactly — integers are exact in a JS number up to 2^53, far beyond
 * numeric(14,2). NaN for anything that is not an amount: the caller may
 * get a value that failed validation.
 */
export function toKopecks(amount: string): number {
  const match = /^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/.exec(normalize(amount));
  if (!match) return Number.NaN;
  const [, sign, whole = '0', fraction = ''] = match;
  const kopecks = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return sign ? -kopecks : kopecks;
}

/** 123450 -> "1234.50", the form the API speaks. */
export function fromKopecks(kopecks: number): string {
  const sign = kopecks < 0 ? '-' : '';
  const abs = Math.abs(kopecks);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
