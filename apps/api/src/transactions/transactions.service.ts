import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateTransactionDto,
  ListTransactionsQuery,
  Transaction,
  TransactionKind,
  TransactionPage,
  TransactionSummary,
  TransactionSummaryQuery,
  UpdateTransactionDto,
} from '@kopilka/shared';
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
  category: { select: categorySelect },
} satisfies Prisma.TransactionSelect;

type TransactionRow = Prisma.TransactionGetPayload<{
  select: typeof transactionSelect;
}>;

/** Decimal -> "1234.50": exact, and always with 2 fraction digits. */
const toTransaction = (row: TransactionRow): Transaction => ({
  ...row,
  amount: row.amount.toFixed(2),
});

const notFound = () =>
  new AppException('NOT_FOUND', 'Transaction not found', HttpStatus.NOT_FOUND);

// The composite foreign key (category_id, user_id) rejects a category of
// another user the same way as a missing one: no ownership pre-check is
// needed, and none can race with a concurrent delete.
const unknownCategory = () =>
  new AppException(
    'VALIDATION_FAILED',
    'Category not found',
    HttpStatus.BAD_REQUEST,
    [{ field: 'categoryId', message: 'Категория не найдена' }],
  );

const emptyToNull = (comment: string | undefined) =>
  comment === undefined ? undefined : comment || null;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

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

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        categoryId: query.categoryId,
        category: query.kind ? { kind: query.kind } : undefined,
        occurredAt: { gte: query.from, lt: query.to },
        // (occurred_at, id) < (cursor.occurredAt, cursor.id); id breaks ties
        // between transactions with the same timestamp.
        ...(cursor && {
          OR: [
            { occurredAt: { lt: cursor.occurredAt } },
            { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
          ],
        }),
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

  /** Totals are summed by Postgres in numeric: exact, unlike floats in JS. */
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

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<Transaction> {
    try {
      const row = await this.prisma.transaction.create({
        data: {
          userId,
          categoryId: dto.categoryId,
          amount: dto.amount,
          occurredAt: dto.occurredAt,
          comment: emptyToNull(dto.comment),
        },
        select: transactionSelect,
      });
      return toTransaction(row);
    } catch (error) {
      if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
        throw unknownCategory();
      }
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    try {
      const row = await this.prisma.transaction.update({
        // userId next to the unique id scopes the update to the owner.
        where: { id, userId },
        data: { ...dto, comment: emptyToNull(dto.comment) },
        select: transactionSelect,
      });
      return toTransaction(row);
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
        throw unknownCategory();
      }
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    try {
      await this.prisma.transaction.delete({ where: { id, userId } });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      throw error;
    }
  }
}
