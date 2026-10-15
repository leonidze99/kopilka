import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Account,
  AccountList,
  AccountType,
  ArchiveAccountResult,
  CreateAccountDto,
  Currency,
  UpdateAccountDto,
} from '@kopilka/shared';
import { AppException } from '../common/errors/app.exception.js';
import { formatMoney } from '../common/money.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService } from '../rates/rates.service.js';

/** The client of an interactive transaction (`prisma.$transaction(fn)`). */
export type Tx = Prisma.TransactionClient;

export const accountRefSelect = {
  id: true,
  name: true,
  type: true,
  currency: true,
} as const;

/**
 * An account (ref) read through accountRefSelect, as the API shows it: the
 * column is CHAR(3) to Prisma, the code one the API itself wrote.
 */
export const toAccountRef = <T extends { currency: string }>(row: T) =>
  row as T & { currency: Currency };

/** What a write needs to know about the money of a user and accounts. */
export interface MoneyContext {
  baseCurrency: Currency;
  timeZone: string;
  /** Account id -> its currency; only the user's own accounts. */
  currencies: Map<string, Currency>;
}

/** Today in UTC, "2026-10-15": the day of "the latest rate". */
export const today = () => new Date().toISOString().slice(0, 10);

interface BalanceRow {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  opening_balance: Prisma.Decimal;
  allow_negative: boolean;
  archived_at: Date | null;
  balance: Prisma.Decimal;
  /** The balance in the user's base currency today; null: no rate. */
  base_balance: Prisma.Decimal | null;
}

// Another user's account is reported exactly like a missing one.
const notFound = () =>
  new AppException('NOT_FOUND', 'Account not found', HttpStatus.NOT_FOUND);

const nameTaken = () =>
  new AppException(
    'CONFLICT',
    'Account with this name already exists',
    HttpStatus.CONFLICT,
    [{ field: 'name', message: 'Счёт с таким названием уже есть' }],
  );

/**
 * Balance = opening balance + income - expenses - transfers out + transfers
 * in, all in the account's currency (a transfer in counts what arrived,
 * to_amount). Computed on read rather than stored: there is nothing to
 * keep in sync on every write, and an edit of an old transaction cannot
 * leave it wrong. Two correlated sums per account, each an index scan
 * (account_id, to_account_id); a user has a handful of accounts.
 *
 * base_balance: the balance at the latest rates, for the total.
 */
const balancesQuery = (userId: string, ids?: string[]) => Prisma.sql`
  SELECT id, name, type, currency, opening_balance, allow_negative,
         archived_at, balance,
         round(balance * exchange_rate(currency, current_date)
               / exchange_rate(base_currency, current_date), 2) AS base_balance
  FROM (
    SELECT a.id, a.name, a.type, a.currency, a.opening_balance,
           a.allow_negative, a.archived_at, a.created_at, u.base_currency,
           a.opening_balance
           + COALESCE((
               -- Money out of the account: a transfer has no category, so it
               -- falls into ELSE together with expenses.
               SELECT SUM(CASE WHEN c.kind = 'income' THEN t.amount ELSE -t.amount END)
               FROM transactions t
               LEFT JOIN categories c ON c.id = t.category_id
               WHERE t.account_id = a.id
             ), 0)
           + COALESCE((
               SELECT SUM(t.to_amount) FROM transactions t
               WHERE t.to_account_id = a.id
             ), 0) AS balance
    FROM accounts a
    JOIN users u ON u.id = a.user_id
    WHERE a.user_id = ${userId}::uuid
      ${ids ? Prisma.sql`AND a.id = ANY(${ids}::uuid[])` : Prisma.empty}
  ) balances
  ORDER BY created_at, id
`;

const toAccount = (row: BalanceRow): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  currency: row.currency,
  openingBalance: new Prisma.Decimal(row.opening_balance).toFixed(2),
  allowNegative: row.allow_negative,
  balance: new Prisma.Decimal(row.balance).toFixed(2),
  archivedAt: row.archived_at,
});

/**
 * A write names an archived account: refused, with the field it came in.
 * `allowed`: archived accounts the write may keep, e.g. those an edited
 * transaction was already on.
 */
export function assertNotArchived(
  archived: Set<string>,
  accounts: { id: string; field: string }[],
  allowed: Iterable<string> = [],
): void {
  const kept = new Set(allowed);
  const account = accounts.find(({ id }) => archived.has(id) && !kept.has(id));
  if (account) {
    throw new AppException(
      'VALIDATION_FAILED',
      'Account is archived',
      HttpStatus.BAD_REQUEST,
      [{ field: account.field, message: 'Счёт в архиве' }],
    );
  }
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
  ) {}

  /**
   * The total converts every balance into the base currency at the latest
   * rate. Rates are loaded only when one is missing (a job keeps them
   * current); a total that still cannot be made is null rather than one
   * that leaves an account out.
   */
  async list(userId: string): Promise<AccountList> {
    let rows = await this.prisma.$queryRaw<BalanceRow[]>(balancesQuery(userId));
    const unconverted = rows.filter((row) => row.base_balance === null);
    if (unconverted.length > 0) {
      const { baseCurrency } = await this.moneyContext(this.prisma, userId);
      await this.rates.ensure(
        [baseCurrency, ...unconverted.map((row) => row.currency)].map(
          (currency) => ({ currency, from: today(), to: today() }),
        ),
      );
      rows = await this.prisma.$queryRaw<BalanceRow[]>(balancesQuery(userId));
    }
    // Decimal: exact, unlike adding floats (the client never adds money).
    const total = rows.every((row) => row.base_balance !== null)
      ? rows
          .reduce(
            (sum, row) => sum.plus(row.base_balance!),
            new Prisma.Decimal(0),
          )
          .toFixed(2)
      : null;
    return { items: rows.map(toAccount), total };
  }

  /**
   * The base currency and time zone of the user, and the currencies of the
   * accounts named that are the user's. Read before a write, to load the
   * rates it needs outside its database transaction.
   */
  async moneyContext(
    client: Tx | PrismaService,
    userId: string,
    accountIds: string[] = [],
  ): Promise<MoneyContext> {
    const user = await client.user.findUniqueOrThrow({
      where: { id: userId },
      select: { baseCurrency: true, timeZone: true },
    });
    const accounts =
      accountIds.length === 0
        ? []
        : await client.account.findMany({
            where: { userId, id: { in: accountIds } },
            select: { id: true, currency: true },
          });
    return {
      baseCurrency: user.baseCurrency as Currency,
      timeZone: user.timeZone,
      currencies: new Map(
        accounts.map(({ id, currency }) => [id, currency as Currency]),
      ),
    };
  }

  async create(userId: string, dto: CreateAccountDto): Promise<Account> {
    const currency =
      dto.currency ??
      (await this.moneyContext(this.prisma, userId)).baseCurrency;
    try {
      const { id } = await this.prisma.account.create({
        data: { userId, ...dto, currency },
        select: { id: true },
      });
      return await this.get(this.prisma, userId, id);
    } catch (error) {
      if (isPrismaError(error, PrismaCode.UniqueViolation)) throw nameTaken();
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, userId, [{ id, field: 'id' }], notFound);
        const current = await tx.account.findUniqueOrThrow({ where: { id } });
        if (dto.currency && dto.currency !== current.currency) {
          await this.assertCurrencyFree(tx, id);
        }
        const allowNegative = dto.allowNegative ?? current.allowNegative;
        const opening = new Prisma.Decimal(
          dto.openingBalance ?? current.openingBalance,
        );
        // The CHECK constraint would refuse it too, with a less helpful error.
        if (!allowNegative && opening.isNegative()) {
          throw new AppException(
            'VALIDATION_FAILED',
            'Negative opening balance on an account that must not go negative',
            HttpStatus.BAD_REQUEST,
            [
              {
                field: 'openingBalance',
                message:
                  'Отрицательный остаток — только у счёта, которому можно в минус',
              },
            ],
          );
        }
        await tx.account.update({ where: { id }, data: dto });
        // Turning the limit on, or lowering the opening balance, must not
        // leave the account below zero.
        await this.assertNotNegative(
          tx,
          userId,
          [id],
          dto.openingBalance !== undefined ? 'openingBalance' : 'allowNegative',
        );
        return this.get(tx, userId, id);
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.UniqueViolation)) throw nameTaken();
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    try {
      await this.prisma.account.delete({
        where: { id_userId: { id, userId } },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      // ON DELETE RESTRICT: the database refuses while transactions use it.
      if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
        throw new AppException(
          'ACCOUNT_IN_USE',
          'Account has transactions',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  /**
   * Locks the accounts a write is about to touch, until the transaction
   * ends. Two concurrent writes to an account run one after the other, so
   * the balance check after a write sees every committed write before it.
   * Without the lock both would check the old balance and both pass: two
   * expenses of 600 from 1000 leave -200 (write skew).
   *
   * Locked in the order of their ids, in one statement: two writes that
   * touch the same pair of accounts cannot each hold one and wait for the
   * other (a deadlock).
   *
   * `missing` builds the error for an id that is not this user's account.
   * Returns the ids of those in the archive, read under the lock: archiving
   * locks the account too, so a write cannot slip onto one being archived.
   */
  async lock(
    tx: Tx,
    userId: string,
    accounts: { id: string; field: string }[],
    missing: (field: string) => Error,
  ): Promise<Set<string>> {
    const ids = [...new Set(accounts.map((account) => account.id))];
    const locked = await tx.$queryRaw<{ id: string; archived: boolean }[]>`
      SELECT id, archived_at IS NOT NULL AS archived FROM accounts
      WHERE user_id = ${userId}::uuid AND id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR UPDATE
    `;
    const found = new Set(locked.map((row) => row.id));
    const absent = accounts.find((account) => !found.has(account.id));
    if (absent) throw missing(absent.field);
    return new Set(locked.filter((row) => row.archived).map((row) => row.id));
  }

  /**
   * Closes an account: only with nothing left on it, so the total of the
   * accounts never holds money nobody sees. Its recurring rules (either
   * side) stop in the same transaction — they would write onto it. Again
   * on an archived account: nothing changes.
   */
  async archive(userId: string, id: string): Promise<ArchiveAccountResult> {
    return this.prisma.$transaction(async (tx) => {
      const archived = await this.lock(
        tx,
        userId,
        [{ id, field: 'id' }],
        notFound,
      );
      if (archived.has(id)) {
        return { account: await this.get(tx, userId, id), stoppedRecurring: 0 };
      }
      const [row] = await tx.$queryRaw<BalanceRow[]>(
        balancesQuery(userId, [id]),
      );
      const balance = new Prisma.Decimal(row!.balance);
      if (!balance.isZero()) {
        throw new AppException(
          'ACCOUNT_NOT_EMPTY',
          'Account still has money on it',
          HttpStatus.CONFLICT,
          [
            {
              field: 'id',
              message: balance.isNegative()
                ? `Счёт в минусе на ${formatMoney(balance.negated(), row!.currency)} — сначала закройте долг`
                : `На счёте ещё ${formatMoney(balance, row!.currency)} — сначала переведите остаток`,
            },
          ],
        );
      }
      const { count } = await tx.recurringRule.updateMany({
        where: {
          userId,
          active: true,
          OR: [{ accountId: id }, { toAccountId: id }],
        },
        data: { active: false },
      });
      await tx.account.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      return {
        account: await this.get(tx, userId, id),
        stoppedRecurring: count,
      };
    });
  }

  /** Back in use. Its stopped recurring rules stay stopped: turned on by hand. */
  async unarchive(userId: string, id: string): Promise<Account> {
    try {
      await this.prisma.account.update({
        where: { id_userId: { id, userId } },
        data: { archivedAt: null },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      throw error;
    }
    return this.get(this.prisma, userId, id);
  }

  /**
   * After a write, inside its transaction: an account that must not go
   * negative is not below zero. Throwing rolls the write back. Checking the
   * outcome rather than each kind of write covers them all alike: an
   * expense, a transfer out, an income moved to another account or deleted.
   */
  async assertNotNegative(
    tx: Tx,
    userId: string,
    ids: string[],
    field: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<BalanceRow[]>(balancesQuery(userId, ids));
    const overdrawn = rows.find(
      (row) =>
        !row.allow_negative && new Prisma.Decimal(row.balance).isNegative(),
    );
    if (!overdrawn) return;
    const shortfall = new Prisma.Decimal(overdrawn.balance).negated();
    throw new AppException(
      'INSUFFICIENT_FUNDS',
      'Account must not go negative',
      HttpStatus.CONFLICT,
      [
        {
          field,
          message: `На счёте «${overdrawn.name}» не хватает ${formatMoney(shortfall, overdrawn.currency)}`,
        },
      ],
    );
  }

  /**
   * Before a write that takes `amount` off an account, inside its
   * transaction and after lock(): what the account would lack, or null if
   * it may go there (it allows negative or has enough). For callers that
   * skip rather than fail, like the recurring runner.
   */
  async shortfall(
    tx: Tx,
    userId: string,
    accountId: string,
    amount: Prisma.Decimal,
  ): Promise<{ account: string; missing: string } | null> {
    const [row] = await tx.$queryRaw<BalanceRow[]>(
      balancesQuery(userId, [accountId]),
    );
    if (!row || row.allow_negative) return null;
    const after = new Prisma.Decimal(row.balance).minus(amount);
    if (!after.isNegative()) return null;
    return {
      account: row.name,
      missing: formatMoney(after.negated(), row.currency),
    };
  }

  /**
   * The amounts of the account's transactions and recurring rules are in
   * its currency: changing it would change what they mean. A goal's target
   * goes along (on an empty account the user is fixing a mistake).
   */
  private async assertCurrencyFree(tx: Tx, id: string): Promise<void> {
    const [row] = await tx.$queryRaw<{ used: boolean }[]>`
      SELECT EXISTS (
               SELECT 1 FROM transactions
               WHERE account_id = ${id}::uuid OR to_account_id = ${id}::uuid
             )
          OR EXISTS (
               SELECT 1 FROM recurring_rules
               WHERE account_id = ${id}::uuid OR to_account_id = ${id}::uuid
             ) AS used
    `;
    if (row?.used) {
      throw new AppException(
        'ACCOUNT_IN_USE',
        'Account currency cannot change while it is in use',
        HttpStatus.CONFLICT,
        [
          {
            field: 'currency',
            message:
              'Валюту можно сменить, только пока у счёта нет операций и регулярных платежей',
          },
        ],
      );
    }
  }

  private async get(
    client: Tx | PrismaService,
    userId: string,
    id: string,
  ): Promise<Account> {
    const [row] = await client.$queryRaw<BalanceRow[]>(
      balancesQuery(userId, [id]),
    );
    if (!row) throw notFound();
    return toAccount(row);
  }
}
