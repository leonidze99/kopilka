import { Prisma } from '../../src/generated/prisma/client.js';
import type { CbrDaily, CbrRate } from '../../src/rates/cbr.client.js';

const DAY_MS = 86_400_000;

/**
 * Stands in for the Bank of Russia in e2e: tests never reach the network,
 * and know the rates they assert with. Every day has a rate (weekends
 * included), the same each day unless a test sets one for a day.
 */
export class FakeCbr {
  /** Roubles for one unit. */
  readonly rates = new Map<string, string>([
    ['USD', '90'],
    ['EUR', '100'],
    ['CNY', '12.5'],
    ['KZT', '0.2'],
  ]);
  /** "USD 2026-10-05" -> a rate for that day only. */
  readonly onDay = new Map<string, string>();
  /** The service is down: every request fails. */
  down = false;
  /** Requests made, "daily" or "USD 2026-09-20..2026-10-05". */
  readonly requests: string[] = [];

  daily(): Promise<CbrDaily> {
    this.requests.push('daily');
    if (this.down) return Promise.reject(new Error('Bank of Russia is down'));
    const onDate = new Date().toISOString().slice(0, 10);
    return Promise.resolve({
      rates: [...this.rates.keys()].map((currency) =>
        this.rate(currency, onDate),
      ),
      ids: new Map([...this.rates.keys()].map((code) => [code, `R-${code}`])),
    });
  }

  range(
    currency: string,
    _id: string,
    from: string,
    to: string,
  ): Promise<CbrRate[]> {
    this.requests.push(`${currency} ${from}..${to}`);
    if (this.down) return Promise.reject(new Error('Bank of Russia is down'));
    const rates: CbrRate[] = [];
    for (
      let day = Date.parse(`${from}T00:00:00Z`);
      day <= Date.parse(`${to}T00:00:00Z`);
      day += DAY_MS
    ) {
      rates.push(this.rate(currency, new Date(day).toISOString().slice(0, 10)));
    }
    return Promise.resolve(rates);
  }

  private rate(currency: string, onDate: string): CbrRate {
    const rate =
      this.onDay.get(`${currency} ${onDate}`) ?? this.rates.get(currency);
    if (!rate) throw new Error(`FakeCbr has no rate for ${currency}`);
    return { currency, onDate, rate: new Prisma.Decimal(rate) };
  }
}
