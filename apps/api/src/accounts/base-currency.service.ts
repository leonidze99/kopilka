import { Injectable, Logger } from '@nestjs/common';
import type { BaseCurrencySettingsDto, Currency, User } from '@kopilka/shared';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  exchangeRateMissing,
  isExchangeRateMissing,
} from '../rates/rate-errors.js';
import { RatesService } from '../rates/rates.service.js';
import { AccountsService, today } from './accounts.service.js';

const unavailable = () =>
  exchangeRateMissing(
    'baseCurrency',
    'Нет курсов ЦБ для пересчёта — попробуйте позже',
  );

/**
 * Changing the currency totals and budgets are counted in. Everything in
 * the old base currency is converted, in one database transaction:
 *
 * - transactions: their base amounts again, at the rate of each one's own
 *   day (the trigger recomputes them when base_manual is written). Amounts
 *   given by hand were in the old currency: they are converted too, and
 *   are no longer marked as given by hand.
 * - limits of budgets and tag budgets: at today's rate. A limit has no day
 *   of its own; "10 000 ₽ a month" becomes what that is today.
 *
 * Accounts keep their currencies; their balances do not change.
 */
@Injectable()
export class BaseCurrencyService {
  private readonly logger = new Logger(BaseCurrencyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly rates: RatesService,
  ) {}

  async set(
    userId: string,
    { baseCurrency }: BaseCurrencySettingsDto,
  ): Promise<User> {
    const { baseCurrency: previous } = await this.accounts.moneyContext(
      this.prisma,
      userId,
    );
    if (previous !== baseCurrency) {
      await this.loadRates(userId, previous, baseCurrency);
      await this.convert(userId, previous, baseCurrency);
      this.logger.log(
        { userId, from: previous, to: baseCurrency },
        'Base currency changed',
      );
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        budgetAlerts: true,
        recurringAlerts: true,
        baseCurrency: true,
      },
    });
    return { ...user, baseCurrency: user.baseCurrency as Currency };
  }

  /** Before the transaction: the days of every transaction on a foreign account. */
  private async loadRates(
    userId: string,
    previous: Currency,
    next: Currency,
  ): Promise<void> {
    const spans = await this.prisma.$queryRaw<
      { currency: string; from: string; to: string }[]
    >`
      SELECT a.currency,
             min((t.occurred_at AT TIME ZONE u.time_zone)::date)::text AS from,
             max((t.occurred_at AT TIME ZONE u.time_zone)::date)::text AS to
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN users u ON u.id = t.user_id
      WHERE t.user_id = ${userId}::uuid AND a.currency <> ${next}
      GROUP BY a.currency
    `;
    await this.rates.ensure([
      ...spans.flatMap(({ currency, from, to }) => [
        { currency, from, to },
        { currency: next, from, to },
      ]),
      { currency: previous, from: today(), to: today() },
      { currency: next, from: today(), to: today() },
    ]);
  }

  private async convert(
    userId: string,
    previous: Currency,
    next: Currency,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Every write of money locks the accounts it touches first: with
          // all of them held, none can slip in with the old base currency.
          const owned = await tx.account.findMany({
            where: { userId },
            select: { id: true },
          });
          await this.accounts.lock(
            tx,
            userId,
            owned.map(({ id }) => ({ id, field: 'baseCurrency' })),
            () => new Error(`Accounts of user ${userId} changed`),
          );

          const [converted] = await tx.$queryRaw<
            { rate: Prisma.Decimal | null }[]
          >`
            SELECT exchange_rate(${previous}::char(3), current_date)
                   / exchange_rate(${next}::char(3), current_date) AS rate
          `;
          if (!converted?.rate) throw unavailable();
          const rate = new Prisma.Decimal(converted.rate);

          await tx.user.update({
            where: { id: userId },
            data: { baseCurrency: next },
          });
          // At least a hundredth: a limit is positive (CHECK).
          await tx.$executeRaw`
            UPDATE budgets SET amount = GREATEST(round(amount * ${rate}, 2), 0.01)
            WHERE user_id = ${userId}::uuid AND amount IS NOT NULL
          `;
          await tx.$executeRaw`
            UPDATE tags SET budget = GREATEST(round(budget * ${rate}, 2), 0.01)
            WHERE user_id = ${userId}::uuid AND budget IS NOT NULL
          `;
          // Written, not changed: the trigger converts each one again.
          await tx.$executeRaw`
            UPDATE transactions SET base_manual = false
            WHERE user_id = ${userId}::uuid
          `;
        },
        // Every transaction of the user is rewritten: seconds for a big one.
        { timeout: 60_000, maxWait: 10_000 },
      );
    } catch (error) {
      if (isExchangeRateMissing(error)) throw unavailable();
      throw error;
    }
  }
}
