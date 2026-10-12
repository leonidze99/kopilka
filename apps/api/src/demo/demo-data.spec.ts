import { addMonths, todayIn } from '../recurring/schedule.js';
import { type AccountKey, buildDemoData, DEMO_TIME_ZONE } from './demo-data.js';

/** Kopecks: whole numbers, exact. */
const kopecks = (amount: string) => Math.round(Number(amount) * 100);

describe('buildDemoData', () => {
  // 01:30 in Moscow on October 12th.
  const now = new Date('2026-10-11T22:30:00Z');
  const data = buildDemoData(now);
  const today = todayIn(DEMO_TIME_ZONE, now);

  it('is the same on every run', () => {
    expect(buildDemoData(now)).toEqual(data);
  });

  it('covers a year up to now and nothing after it', () => {
    const times = data.transactions.map((t) => t.occurredAt.getTime());
    expect(Math.max(...times)).toBeLessThanOrEqual(now.getTime());
    expect(new Date(Math.min(...times)).toISOString().slice(0, 7)).toBe(
      '2025-11',
    );
    expect(data.transactions.length).toBeGreaterThan(500);
  });

  it('never takes an account that must not go negative below zero', () => {
    const balance = new Map<AccountKey, number>(
      data.accounts.map((a) => [a.key, kopecks(a.openingBalance)]),
    );
    const kinds = new Map(data.categories.map((c) => [c.key, c.kind]));
    for (const t of data.transactions) {
      const amount = kopecks(t.amount);
      const income = t.category && kinds.get(t.category) === 'income';
      balance.set(
        t.account,
        (balance.get(t.account) ?? 0) + (income ? amount : -amount),
      );
      if (t.toAccount) {
        balance.set(t.toAccount, (balance.get(t.toAccount) ?? 0) + amount);
      }
    }
    for (const account of data.accounts.filter((a) => !a.allowNegative)) {
      expect(balance.get(account.key), account.name).toBeGreaterThanOrEqual(0);
    }
  });

  it('has made every payment of a rule up to today, and the next one is ahead', () => {
    for (const rule of data.rules) {
      const made = data.transactions
        .filter((t) => t.rule?.key === rule.key)
        .map((t) => t.rule?.on);
      expect(made).toEqual(
        Array.from({ length: rule.nextIndex }, (_, n) =>
          addMonths(rule.startOn, n),
        ),
      );
      expect(rule.nextOn > today).toBe(true);
    }
  });

  it('uses every category and keeps budgets on first days of months', () => {
    const used = new Set(data.transactions.map((t) => t.category));
    expect(data.categories.filter((c) => !used.has(c.key))).toEqual([]);
    for (const budget of data.budgets) {
      expect(budget.effectiveFrom).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });
});
