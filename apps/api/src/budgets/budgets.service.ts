import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  BudgetList,
  BudgetsQuery,
  SetBudgetDto,
  TransactionKind,
} from '@kopilka/shared';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface BudgetRow {
  id: string;
  kind: TransactionKind;
  name: string;
  limit_amount: Prisma.Decimal;
  since: Date;
  spent: Prisma.Decimal;
}

/** "2026-10" -> the date column value of that month, "2026-10-01". */
const firstDayOf = (month: string) => `${month}-01`;

/** A date column comes back as UTC midnight: "2026-10-01T00:00Z" -> "2026-10". */
const monthOf = (date: Date) => date.toISOString().slice(0, 7);

const notFound = () =>
  new AppException('NOT_FOUND', 'Category not found', HttpStatus.NOT_FOUND);

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The limits that apply in a month and what was spent against them.
   * DISTINCT ON keeps, per category, the first row in ORDER BY: the latest
   * version that started in this month or before. The unique index
   * (category_id, effective_from) serves that order.
   */
  async list(
    userId: string,
    { month, from, to }: BudgetsQuery,
  ): Promise<BudgetList> {
    const rows = await this.prisma.$queryRaw<BudgetRow[]>`
      WITH current_limits AS (
        SELECT DISTINCT ON (b.category_id)
               b.category_id, b.amount, b.effective_from
        FROM budgets b
        WHERE b.user_id = ${userId}::uuid
          AND b.effective_from <= ${firstDayOf(month)}::date
        ORDER BY b.category_id, b.effective_from DESC
      )
      SELECT c.id, c.kind, c.name,
             l.amount AS limit_amount,
             l.effective_from AS since,
             COALESCE((
               SELECT SUM(t.amount) FROM transactions t
               WHERE t.category_id = c.id
                 AND t.occurred_at >= ${from} AND t.occurred_at < ${to}
             ), 0) AS spent
      FROM current_limits l
      JOIN categories c ON c.id = l.category_id
      -- A NULL version: the category stopped being budgeted.
      WHERE l.amount IS NOT NULL
      ORDER BY c.name
    `;

    // Decimal all the way: exact, and the client never adds money up.
    const total = {
      limit: new Prisma.Decimal(0),
      spent: new Prisma.Decimal(0),
    };
    const items = rows.map((row) => {
      const limit = new Prisma.Decimal(row.limit_amount);
      const spent = new Prisma.Decimal(row.spent);
      total.limit = total.limit.plus(limit);
      total.spent = total.spent.plus(spent);
      return {
        category: { id: row.id, kind: row.kind, name: row.name },
        limit: limit.toFixed(2),
        spent: spent.toFixed(2),
        remaining: limit.minus(spent).toFixed(2),
        since: monthOf(row.since),
      };
    });

    return {
      items,
      total: {
        limit: total.limit.toFixed(2),
        spent: total.spent.toFixed(2),
        remaining: total.limit.minus(total.spent).toFixed(2),
      },
    };
  }

  /**
   * Writes the version that starts in `month`: an upsert on (category,
   * month), so setting the limit twice in a month keeps one row. Months
   * before keep their versions; later versions keep theirs.
   */
  async set(
    userId: string,
    categoryId: string,
    { month, amount }: SetBudgetDto,
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id_userId: { id: categoryId, userId } },
      select: { kind: true },
    });
    if (!category) throw notFound();
    if (category.kind !== 'expense') {
      throw new AppException(
        'VALIDATION_FAILED',
        'Budgets are for expense categories',
        HttpStatus.BAD_REQUEST,
        [{ message: 'Бюджет задаётся только для категорий расходов' }],
      );
    }

    const effectiveFrom = new Date(firstDayOf(month));
    try {
      await this.prisma.budget.upsert({
        where: { categoryId_effectiveFrom: { categoryId, effectiveFrom } },
        create: { userId, categoryId, effectiveFrom, amount },
        update: { amount },
      });
    } catch (error) {
      // The category was deleted between the check and the write.
      if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
        throw notFound();
      }
      throw error;
    }
  }
}
