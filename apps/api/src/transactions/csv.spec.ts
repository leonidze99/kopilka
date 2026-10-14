import type { Transaction } from '@kopilka/shared';
import { csvAmount, csvDateTime, csvLine, transactionCsvRows } from './csv.js';

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

  describe('transactionCsvRows', () => {
    const base = {
      id: 'a',
      amount: '1234.50',
      comment: 'Пятёрочка',
      occurredAt: new Date('2026-10-12T22:30:00Z'),
      createdAt: new Date(),
      recurringRuleId: null,
      account: { id: 'acc', name: 'Карта', type: 'card' },
      tags: [] as { id: string; name: string }[],
    };

    it('names the category and the tags of an expense, no target', () => {
      const expense = {
        ...base,
        type: 'expense',
        category: { id: 'cat', kind: 'expense', name: 'Продукты' },
        splits: [],
        tags: [
          { id: 't1', name: 'Отпуск' },
          { id: 't2', name: 'Сочи' },
        ],
      } as Transaction;

      expect(transactionCsvRows(expense, 'Europe/Moscow')).toEqual([
        [
          '13.10.2026 01:30',
          'Расход',
          'Продукты',
          'Карта',
          '',
          '1234,50',
          'Пятёрочка',
          'Отпуск, Сочи',
        ],
      ]);
    });

    it('writes a line per part of a split transaction', () => {
      const split = {
        ...base,
        type: 'expense',
        category: null,
        splits: [
          {
            category: { id: 'c1', kind: 'expense', name: 'Продукты' },
            amount: '1000.00',
          },
          {
            category: { id: 'c2', kind: 'expense', name: 'Дом' },
            amount: '234.50',
          },
        ],
      } as Transaction;

      expect(transactionCsvRows(split, 'UTC')).toEqual([
        [
          '12.10.2026 22:30',
          'Расход',
          'Продукты',
          'Карта',
          '',
          '1000,00',
          'Пятёрочка',
          '',
        ],
        [
          '12.10.2026 22:30',
          'Расход',
          'Дом',
          'Карта',
          '',
          '234,50',
          'Пятёрочка',
          '',
        ],
      ]);
    });

    it('names both accounts of a transfer and no category', () => {
      const transfer = {
        ...base,
        type: 'transfer',
        comment: null,
        toAccount: { id: 'acc2', name: 'Накопления' },
      } as Transaction;

      expect(transactionCsvRows(transfer, 'UTC')).toEqual([
        [
          '12.10.2026 22:30',
          'Перевод',
          '',
          'Карта',
          'Накопления',
          '1234,50',
          '',
          '',
        ],
      ]);
    });
  });
});
