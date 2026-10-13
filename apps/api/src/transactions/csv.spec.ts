import type { Transaction } from '@kopilka/shared';
import {
  csvAmount,
  csvDateTime,
  csvLine,
  transactionCsvFields,
} from './csv.js';

describe('csv', () => {
  describe('csvLine', () => {
    it('separates fields with a semicolon and ends with CRLF', () => {
      expect(csvLine(['a', 'b'])).toBe('a;b\r\n');
    });

    it.each([
      ['Кафе; бар', '"Кафе; бар"'],
      ['Скидка "весна"', '"Скидка ""весна"""'],
      ['Две\nстроки', '"Две\nстроки"'],
      ['Обычный', 'Обычный'],
    ])('quotes %s as %s', (field, expected) => {
      expect(csvLine([field])).toBe(expected + '\r\n');
    });
  });

  it('writes the amount with a comma, as a Russian spreadsheet reads it', () => {
    expect(csvAmount('1234.50')).toBe('1234,50');
  });

  describe('csvDateTime', () => {
    // 22:30 UTC is already the next day in Moscow.
    const date = new Date('2026-10-12T22:30:00Z');

    it.each([
      ['UTC', '12.10.2026 22:30'],
      ['Europe/Moscow', '13.10.2026 01:30'],
      ['America/New_York', '12.10.2026 18:30'],
    ])('in %s reads %s', (zone, expected) => {
      expect(csvDateTime(date, zone)).toBe(expected);
    });
  });

  describe('transactionCsvFields', () => {
    const base = {
      id: 'a',
      amount: '1234.50',
      comment: 'Пятёрочка',
      occurredAt: new Date('2026-10-12T22:30:00Z'),
      createdAt: new Date(),
      recurringRuleId: null,
      account: { id: 'acc', name: 'Карта' },
    };

    it('names the category of an expense and leaves the target empty', () => {
      const expense = {
        ...base,
        type: 'expense',
        category: { id: 'cat', kind: 'expense', name: 'Продукты' },
      } as Transaction;

      expect(transactionCsvFields(expense, 'Europe/Moscow')).toEqual([
        '13.10.2026 01:30',
        'Расход',
        'Продукты',
        'Карта',
        '',
        '1234,50',
        'Пятёрочка',
      ]);
    });

    it('names both accounts of a transfer and no category', () => {
      const transfer = {
        ...base,
        type: 'transfer',
        comment: null,
        toAccount: { id: 'acc2', name: 'Накопления' },
      } as Transaction;

      expect(transactionCsvFields(transfer, 'UTC')).toEqual([
        '12.10.2026 22:30',
        'Перевод',
        '',
        'Карта',
        'Накопления',
        '1234,50',
        '',
      ]);
    });
  });
});
