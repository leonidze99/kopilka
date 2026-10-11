import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Account,
  AccountList,
  AccountType,
  CreateAccountDto,
  UpdateAccountDto,
} from '@kopilka/shared';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** The client of an interactive transaction (`prisma.$transaction(fn)`). */
export type Tx = Prisma.TransactionClient;

export const accountRefSelect = { id: true, name: true, type: true } as const;

interface BalanceRow {
  id: string;
  name: string;
  type: AccountType;
  opening_balance: Prisma.Decimal;
  allow_negative: boolean;
  balance: Prisma.Decimal;
}

const rubles = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
});

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
 * in. Computed on read rather than stored: there is nothing to keep in sync
 * on every write, and an edit of an old transaction cannot leave it wrong.
 * Two correlated sums per account, each an index scan (account_id,
 * to_account_id); a user has a handful of accounts.
 */
const balancesQuery = (userId: string, ids?: string[]) => Prisma.sql`
  SELECT a.id, a.name, a.type, a.opening_balance, a.allow_negative,
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
             SELECT SUM(t.amount) FROM transactions t WHERE t.to_account_id = a.id
           ), 0) AS balance
  FROM accounts a
  WHERE a.user_id = ${userId}::uuid
    ${ids ? Prisma.sql`AND a.id = ANY(${ids}::uuid[])` : Prisma.empty}
  ORDER BY a.created_at, a.id
`;

const toAccount = (row: BalanceRow): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  openingBalance: new Prisma.Decimal(row.opening_balance).toFixed(2),
  allowNegative: row.allow_negative,
  balance: new Prisma.Decimal(row.balance).toFixed(2),
});

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AccountList> {
    const rows = await this.prisma.$queryRaw<BalanceRow[]>(
      balancesQuery(userId),
    );
    // Decimal: exact, unlike adding floats (the client never adds money).
    const total = rows.reduce(
      (sum, row) => sum.plus(row.balance),
      new Prisma.Decimal(0),
    );
    return { items: rows.map(toAccount), total: total.toFixed(2) };
  }

  async create(userId: string, dto: CreateAccountDto): Promise<Account> {
    try {
      const { id } = await this.prisma.account.create({
        data: { userId, ...dto },
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
   */
  async lock(
    tx: Tx,
    userId: string,
    accounts: { id: string; field: string }[],
    missing: (field: string) => Error,
  ): Promise<void> {
    const ids = [...new Set(accounts.map((account) => account.id))];
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM accounts
      WHERE user_id = ${userId}::uuid AND id = ANY(${ids}::uuid[])
      ORDER BY id
      FOR UPDATE
    `;
    const found = new Set(locked.map((row) => row.id));
    const absent = accounts.find((account) => !found.has(account.id));
    if (absent) throw missing(absent.field);
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
          message: `На счёте «${overdrawn.name}» не хватает ${rubles.format(shortfall.toNumber())}`,
        },
      ],
    );
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
