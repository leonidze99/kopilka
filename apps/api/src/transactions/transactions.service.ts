import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CategoryTotal,
  CategoryTotalsQuery,
  ListTransactionsQuery,
  Transaction,
  TransactionInputDto,
  TransactionKind,
  TransactionPage,
  TransactionSummary,
  TransactionSummaryQuery,
} from '@kopilka/shared';
import {
  accountRefSelect,
  AccountsService,
  type Tx,
} from '../accounts/accounts.service.js';
import { categorySelect } from '../categories/categories.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor } from './cursor.js';

const transactionSelect = {
  id: true,
  amount: true,
  comment: true,
  occurredAt: true,
  createdAt: true,
  recurringRuleId: true,
  account: { select: accountRefSelect },
  toAccount: { select: accountRefSelect },
  category: { select: categorySelect },
} satisfies Prisma.TransactionSelect;

type TransactionRow = Prisma.TransactionGetPayload<{
  select: typeof transactionSelect;
}>;

/**
 * A row as the API shows it: a transfer, or income/expense with the kind
 * of its category. Decimal -> "1234.50": exact, always 2 fraction digits.
 */
function toTransaction({
  toAccount,
  category,
  ...row
}: TransactionRow): Transaction {
  const common = { ...row, amount: row.amount.toFixed(2) };
  if (toAccount) return { type: 'transfer', ...common, toAccount };
  // CHECK (num_nonnulls(category_id, to_account_id) = 1) rules this out.
  if (!category) throw new Error(`Transaction ${row.id} has no category`);
  return { type: category.kind, ...common, category };
}

const notFound = () =>
  new AppException('NOT_FOUND', 'Transaction not found', HttpStatus.NOT_FOUND);

const invalid = (field: string, message: string, detail: string) =>
  new AppException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST, [
    { field, message: detail },
  ]);

const unknownAccount = (field: string) =>
  invalid(field, 'Account not found', 'Счёт не найден');

const unknownCategory = () =>
  invalid('categoryId', 'Category not found', 'Категория не найдена');

/** The accounts a transaction moves money on, with the field naming each. */
const accountsOf = (dto: TransactionInputDto) => [
  { id: dto.accountId, field: 'accountId' },
  ...(dto.type === 'transfer'
    ? [{ id: dto.toAccountId, field: 'toAccountId' }]
    : []),
];

/** Columns to write; the other side of category/transfer is cleared. */
const columnsOf = (dto: TransactionInputDto) => ({
  accountId: dto.accountId,
  categoryId: dto.type === 'transfer' ? null : dto.categoryId,
  toAccountId: dto.type === 'transfer' ? dto.toAccountId : null,
  amount: dto.amount,
  occurredAt: dto.occurredAt,
  comment: dto.comment || null,
});

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  /**
   * Keyset (cursor) pagination: the next page starts strictly after the
   * last row of the previous one in ORDER BY occurred_at DESC, id DESC.
   * Unlike OFFSET it costs the same on page 1 and page 1000 (an index seek,
   * not skipping N rows), and rows inserted meanwhile do not shift pages.
   */
  async list(
    userId: string,
    query: ListTransactionsQuery,
  ): Promise<TransactionPage> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
    const and: Prisma.TransactionWhereInput[] = [];
    // A transfer belongs to both of its accounts.
    if (query.accountId) {
      and.push({
        OR: [{ accountId: query.accountId }, { toAccountId: query.accountId }],
      });
    }
    // (occurred_at, id) < (cursor.occurredAt, cursor.id); id breaks ties
    // between transactions with the same timestamp.
    if (cursor) {
      and.push({
        OR: [
          { occurredAt: { lt: cursor.occurredAt } },
          { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        categoryId: query.categoryId,
        ...(query.type === 'transfer'
          ? { toAccountId: { not: null } }
          : query.type && { category: { kind: query.type } }),
        occurredAt: { gte: query.from, lt: query.to },
        AND: and,
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      // One extra row tells whether there is a next page, without COUNT(*).
      take: query.limit + 1,
      select: transactionSelect,
    });

    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map(toTransaction),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  /**
   * Totals are summed by Postgres in numeric: exact, unlike floats in JS.
   * The JOIN with categories leaves transfers out: moving money between
   * one's own accounts is neither income nor expense.
   */
  async summary(
    userId: string,
    { from, to }: TransactionSummaryQuery,
  ): Promise<TransactionSummary> {
    const conditions = [Prisma.sql`t.user_id = ${userId}::uuid`];
    if (from) conditions.push(Prisma.sql`t.occurred_at >= ${from}`);
    if (to) conditions.push(Prisma.sql`t.occurred_at < ${to}`);

    const rows = await this.prisma.$queryRaw<
      { kind: TransactionKind; total: Prisma.Decimal }[]
    >`
      SELECT c.kind, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY c.kind
    `;

    const total = (kind: TransactionKind) =>
      new Prisma.Decimal(rows.find((r) => r.kind === kind)?.total ?? 0);
    const income = total('income');
    const expense = total('expense');
    return {
      income: income.toFixed(2),
      expense: expense.toFixed(2),
      balance: income.minus(expense).toFixed(2),
    };
  }

  /**
   * Totals per category of one kind, largest first. One GROUP BY in the
   * database instead of loading transactions: the work and the result stay
   * small however many transactions there are.
   */
  async byCategory(
    userId: string,
    { from, to, kind }: CategoryTotalsQuery,
  ): Promise<CategoryTotal[]> {
    const conditions = [
      Prisma.sql`t.user_id = ${userId}::uuid`,
      Prisma.sql`c.kind = ${kind}::transaction_kind`,
    ];
    if (from) conditions.push(Prisma.sql`t.occurred_at >= ${from}`);
    if (to) conditions.push(Prisma.sql`t.occurred_at < ${to}`);

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        kind: TransactionKind;
        name: string;
        total: Prisma.Decimal;
      }[]
    >`
      SELECT c.id, c.kind, c.name, SUM(t.amount) AS total
      FROM transactions t
      JOIN categories c ON c.id = t.category_id AND c.user_id = t.user_id
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY c.id
      ORDER BY total DESC, c.name
    `;

    return rows.map(({ total, ...category }) => ({
      category,
      total: new Prisma.Decimal(total).toFixed(2),
    }));
  }

  /**
   * Every write runs in one database transaction: lock the accounts it
   * touches, write, check that no account went below its limit. A failed
   * check rolls the write back.
   */
  create(userId: string, dto: TransactionInputDto): Promise<Transaction> {
    return this.write(async (tx) => {
      const accounts = accountsOf(dto);
      await this.accounts.lock(tx, userId, accounts, unknownAccount);
      await this.checkCategory(tx, userId, dto);
      const row = await tx.transaction.create({
        data: { userId, ...columnsOf(dto) },
        select: transactionSelect,
      });
      await this.accounts.assertNotNegative(
        tx,
        userId,
        accounts.map((account) => account.id),
        'amount',
      );
      return toTransaction(row);
    });
  }

  /** Replaces the whole transaction: it may even become a transfer. */
  update(
    userId: string,
    id: string,
    dto: TransactionInputDto,
  ): Promise<Transaction> {
    return this.write(async (tx) => {
      // The accounts it was on lose or regain its money too.
      const before = await this.lockTransaction(tx, userId, id);
      const accounts = [...before, ...accountsOf(dto)];
      await this.accounts.lock(tx, userId, accounts, unknownAccount);
      await this.checkCategory(tx, userId, dto);
      const row = await tx.transaction.update({
        where: { id, userId },
        data: columnsOf(dto),
        select: transactionSelect,
      });
      await this.accounts.assertNotNegative(
        tx,
        userId,
        accounts.map((account) => account.id),
        'amount',
      );
      return toTransaction(row);
    });
  }

  /** Deleting an income (or a transfer in) takes money off an account too. */
  remove(userId: string, id: string): Promise<void> {
    return this.write(async (tx) => {
      const accounts = await this.lockTransaction(tx, userId, id);
      await this.accounts.lock(tx, userId, accounts, unknownAccount);
      await tx.transaction.delete({ where: { id, userId } });
      await this.accounts.assertNotNegative(
        tx,
        userId,
        accounts.map((account) => account.id),
        'id',
      );
    });
  }

  /**
   * Locks the row before reading which accounts it is on: otherwise a
   * concurrent edit could move it to another account between the read and
   * the account locks. Row first, then accounts, on every path: no two
   * writes wait for each other in a circle.
   */
  private async lockTransaction(tx: Tx, userId: string, id: string) {
    const [row] = await tx.$queryRaw<
      { account_id: string; to_account_id: string | null }[]
    >`
      SELECT account_id, to_account_id FROM transactions
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE
    `;
    if (!row) throw notFound();
    return [row.account_id, row.to_account_id]
      .filter((accountId) => accountId !== null)
      .map((accountId) => ({ id: accountId, field: 'id' }));
  }

  /**
   * The composite foreign key rejects another user's category, but not
   * one of the other kind: an "expense" in a salary category.
   */
  private async checkCategory(
    tx: Tx,
    userId: string,
    dto: TransactionInputDto,
  ) {
    if (dto.type === 'transfer') return;
    const category = await tx.category.findUnique({
      where: { id_userId: { id: dto.categoryId, userId } },
      select: { kind: true },
    });
    if (!category) throw unknownCategory();
    if (category.kind !== dto.type) {
      throw invalid(
        'categoryId',
        'Category of another kind',
        dto.type === 'income'
          ? 'Это категория расходов'
          : 'Это категория доходов',
      );
    }
  }

  /**
   * An interactive transaction at the default READ COMMITTED: each query
   * sees what was committed before it started, so the balance check after
   * the account lock sees every write the lock waited for.
   */
  private async write<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      // The category was deleted between the check and the insert.
      if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
        throw unknownCategory();
      }
      throw error;
    }
  }
}
