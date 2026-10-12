import type { ImportColumns } from '@kopilka/shared';
import { parseAmount, parseLocalDateTime, parseRow } from './parse-row.js';
import { suggestColumns } from './presets.js';

describe('parseAmount', () => {
  it.each([
    ['-1234,56', '-1234.56'],
    ['−1 234,56 ₽', '-1234.56'],
    ['1 234.5', '1234.5'],
    ['+500', '500'],
    ['1,234.56', '1234.56'],
    ['1.234,56', '1234.56'],
    ['300 руб.', '300'],
  ])('%s is %s', (raw, expected) => {
    expect(parseAmount(raw)?.toString()).toBe(expected);
  });

  it.each(['', 'abc', '12a3', '1.234.567', '1,234', '0,123'])(
    '%j is not an amount',
    (raw) => {
      expect(parseAmount(raw)).toBeNull();
    },
  );
});

describe('parseLocalDateTime', () => {
  it.each([
    ['05.10.2026 14:30:15', 'dmy', '2026-10-05 14:30:15'],
    ['05.10.2026', 'dmy', '2026-10-05 00:00:00'],
    ['5/10/26 9:05', 'dmy', '2026-10-05 09:05:00'],
    ['2026-10-05T14:30', 'ymd', '2026-10-05 14:30:00'],
    ['10/05/2026', 'mdy', '2026-10-05 00:00:00'],
  ] as const)('%s (%s) is %s', (raw, order, expected) => {
    expect(parseLocalDateTime(raw, order)).toBe(expected);
  });

  it.each([
    ['31.02.2026', 'dmy'],
    ['05.13.2026', 'dmy'],
    ['05.10.2026 25:00', 'dmy'],
    ['вчера', 'dmy'],
    ['05.10.2026', 'ymd'],
  ] as const)('%s (%s) is not a date', (raw, order) => {
    expect(parseLocalDateTime(raw, order)).toBeNull();
  });
});

describe('parseRow', () => {
  const columns: ImportColumns = {
    date: 0,
    dateOrder: 'dmy',
    amount: { type: 'signed', column: 1 },
    description: 2,
    category: 3,
    status: { column: 4, value: 'OK' },
  };

  it('reads an expense', () => {
    expect(
      parseRow(
        ['05.10.2026 14:30:00', '-250,00', ' Кофе  у  дома ', 'Кафе', 'OK'],
        columns,
      ),
    ).toMatchObject({
      status: 'new',
      localAt: '2026-10-05 14:30:00',
      amount: '250.00',
      kind: 'expense',
      description: 'Кофе у дома',
      sourceCategory: 'Кафе',
    });
  });

  it('reads an income with no description', () => {
    expect(
      parseRow(['05.10.2026', '1000', '', '', 'OK'], columns),
    ).toMatchObject({
      status: 'new',
      kind: 'income',
      amount: '1000.00',
      description: null,
      sourceCategory: '',
    });
  });

  it('skips rows with another status and zero amounts', () => {
    expect(parseRow(['05.10.2026', '-1', '', '', 'FAILED'], columns)).toEqual({
      status: 'skipped',
      error: 'Статус «FAILED»',
    });
    expect(
      parseRow(['05.10.2026', '0,00', '', '', 'OK'], columns),
    ).toMatchObject({
      status: 'skipped',
    });
  });

  it('explains what it cannot read', () => {
    expect(parseRow(['вчера', '-1', '', '', 'OK'], columns)).toEqual({
      status: 'invalid',
      error: 'Не дата: «вчера»',
    });
    expect(parseRow(['05.10.2026', 'много', '', '', 'OK'], columns)).toEqual({
      status: 'invalid',
      error: 'Не сумма: «много»',
    });
  });

  it('nets income and expense columns', () => {
    const split: ImportColumns = {
      ...columns,
      amount: { type: 'split', income: 1, expense: 2 },
      description: null,
      category: null,
      status: null,
    };
    expect(parseRow(['05.10.2026', '', '300'], split)).toMatchObject({
      kind: 'expense',
      amount: '300.00',
    });
    expect(parseRow(['05.10.2026', '500', '-200'], split)).toMatchObject({
      kind: 'income',
      amount: '300.00',
    });
  });

  it('gives equal rows equal fingerprints, case and spacing aside', () => {
    const a = parseRow(['05.10.2026', '-250', 'Кофе', '', 'OK'], columns);
    const b = parseRow(
      ['05.10.2026', '-250,00', ' кофе ', 'Еда', 'OK'],
      columns,
    );
    const c = parseRow(['05.10.2026', '-251', 'Кофе', '', 'OK'], columns);
    expect(a.status === 'new' && b.status === 'new' && c.status === 'new').toBe(
      true,
    );
    if (a.status !== 'new' || b.status !== 'new' || c.status !== 'new') return;
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
  });
});

describe('suggestColumns', () => {
  it('recognises a T-Bank statement', () => {
    const headers = [
      'Дата операции',
      'Дата платежа',
      'Номер карты',
      'Статус',
      'Сумма операции',
      'Валюта операции',
      'Сумма платежа',
      'Валюта платежа',
      'Кэшбэк',
      'Категория',
      'MCC',
      'Описание',
    ];
    expect(suggestColumns(headers, [])).toEqual({
      preset: 'tbank',
      columns: {
        date: 0,
        dateOrder: 'dmy',
        amount: { type: 'signed', column: 6 },
        description: 11,
        category: 9,
        status: { column: 3, value: 'OK' },
      },
    });
  });

  it('guesses other files by header names', () => {
    expect(
      suggestColumns(
        ['Date', 'Payee', 'Amount'],
        [['2026-10-05', 'Shop', '-5']],
      ),
    ).toEqual({
      preset: null,
      columns: {
        date: 0,
        dateOrder: 'ymd',
        amount: { type: 'signed', column: 2 },
        description: 1,
        category: null,
        status: null,
      },
    });
  });

  it('leaves the columns to the user when it finds no date or amount', () => {
    expect(suggestColumns(['a', 'b'], [])).toEqual({
      preset: null,
      columns: null,
    });
  });
});
