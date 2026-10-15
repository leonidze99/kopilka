import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type CbrRate, CbrClient } from './cbr.client.js';

/** Rates of a currency wanted for every day of [from, to] ("2026-10-01"). */
export interface RateNeed {
  currency: string;
  from: string;
  to: string;
}

/**
 * A day counts as covered when a rate was set within this many days
 * before it: weekends and a few holidays have none. Stricter than what
 * exchange_rate() accepts (14 days), so a gap left by a few missed daily
 * runs is filled in from the Bank of Russia rather than bridged.
 */
const COVERED_WITHIN_DAYS = 7;

/** "2026-10-15" minus 14 days -> "2026-10-01". */
const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** The id of each currency in the Bank of Russia's ranges, for a day. */
const IDS_TTL_MS = 24 * 60 * 60_000;

/**
 * Bank of Russia rates in exchange_rates, which exchange_rate() and the
 * transactions_money trigger read. Kept current by a job; older days are
 * fetched when a write needs them (an import of last year's statement).
 *
 * Network calls happen here, before the database transaction of a write,
 * never inside one. A failure is logged and swallowed: the write then finds
 * the rate missing and says so to the user, who can give the amount in the
 * base currency by hand.
 */
@Injectable()
export class RatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RatesService.name);
  private readonly jobsEnabled: boolean;
  private ids?: { map: Map<string, string>; at: number };

  constructor(
    private readonly prisma: PrismaService,
    private readonly cbr: CbrClient,
    config: ConfigService<Env, true>,
  ) {
    this.jobsEnabled = config.get('JOBS_ENABLED', { infer: true });
  }

  /** At start too: a fresh database has no rates until the first run. */
  onApplicationBootstrap(): void {
    void this.tick();
  }

  // Tomorrow's rates appear in the afternoon (Moscow); every three hours
  // picks them up the same day.
  @Cron(CronExpression.EVERY_3_HOURS, { name: 'exchange-rates' })
  async tick(): Promise<void> {
    if (!this.jobsEnabled) return;
    try {
      await this.refresh();
    } catch (error) {
      this.logger.warn({ err: error }, 'Exchange rates not refreshed');
    }
  }

  /** The latest rates the Bank of Russia has set, stored. */
  async refresh(): Promise<number> {
    const daily = await this.cbr.daily();
    this.ids = { map: daily.ids, at: Date.now() };
    return this.store(daily.rates);
  }

  /**
   * Makes sure exchange_rate() can convert the currencies on the days
   * asked: for each one with uncovered days, one request for the range
   * from two weeks before the first of them to the last. Days after today
   * need today's rate (there is none for them yet). The rouble needs none.
   */
  async ensure(needs: RateNeed[]): Promise<void> {
    for (const need of merge(needs)) {
      try {
        await this.ensureOne(need);
      } catch (error) {
        this.logger.warn(
          { err: error, ...need },
          'Exchange rates not loaded from the Bank of Russia',
        );
      }
    }
  }

  private async ensureOne({ currency, from, to }: RateNeed): Promise<void> {
    const [gap] = await this.prisma.$queryRaw<
      { first: string | null; last: string | null }[]
    >`
      SELECT min(d)::date::text AS first, max(d)::date::text AS last
      FROM generate_series(
        LEAST(${from}::date, current_date),
        LEAST(${to}::date, current_date),
        interval '1 day'
      ) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM exchange_rates r
        WHERE r.currency = ${currency}
          AND r.on_date <= d::date
          AND r.on_date >= d::date - ${COVERED_WITHIN_DAYS}::int
      )
    `;
    if (!gap?.first || !gap.last) return;

    const id = await this.idOf(currency);
    if (!id) {
      this.logger.warn({ currency }, 'No Bank of Russia rate for currency');
      return;
    }
    const rates = await this.cbr.range(
      currency,
      id,
      daysBefore(gap.first, 14),
      gap.last,
    );
    await this.store(rates);
  }

  private async idOf(currency: string): Promise<string | undefined> {
    if (!this.ids || Date.now() - this.ids.at > IDS_TTL_MS) {
      await this.refresh();
    }
    return this.ids?.map.get(currency);
  }

  /** Set rates do not change: a second copy of one is skipped. */
  private async store(rates: CbrRate[]): Promise<number> {
    if (rates.length === 0) return 0;
    const { count } = await this.prisma.exchangeRate.createMany({
      data: rates.map(({ currency, onDate, rate }) => ({
        currency,
        onDate: new Date(`${onDate}T00:00:00Z`),
        rate,
      })),
      skipDuplicates: true,
    });
    return count;
  }
}

/** One need per currency, over the union of its ranges; no rouble. */
function merge(needs: RateNeed[]): RateNeed[] {
  const byCurrency = new Map<string, RateNeed>();
  for (const need of needs) {
    if (need.currency === 'RUB') continue;
    const known = byCurrency.get(need.currency);
    byCurrency.set(
      need.currency,
      known
        ? {
            currency: need.currency,
            from: need.from < known.from ? need.from : known.from,
            to: need.to > known.to ? need.to : known.to,
          }
        : { ...need },
    );
  }
  return [...byCurrency.values()];
}
