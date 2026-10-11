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
      .regex(AMOUNT_PATTERN, {
        message: 'Сумма — число, не больше двух знаков после запятой',
        // Not a number at all: the "greater than zero" check would only add noise.
        abort: true,
      })
      .refine((value) => Number(value) > 0, 'Сумма должна быть больше нуля'),
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
