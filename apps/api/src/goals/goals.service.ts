import { HttpStatus, Injectable } from '@nestjs/common';
import type { Goal, GoalInputDto } from '@kopilka/shared';
import {
  accountRefSelect,
  AccountsService,
  toAccountRef,
} from '../accounts/accounts.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { isPrismaError, PrismaCode } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { todayIn } from '../recurring/schedule.js';

const goalSelect = {
  id: true,
  name: true,
  targetAmount: true,
  targetDate: true,
  account: { select: accountRefSelect },
} satisfies Prisma.GoalSelect;

type GoalRow = Prisma.GoalGetPayload<{ select: typeof goalSelect }>;

const notFound = () =>
  new AppException('NOT_FOUND', 'Goal not found', HttpStatus.NOT_FOUND);

const invalid = (field: string, message: string, detail: string) =>
  new AppException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST, [
    { field, message: detail },
  ]);

const taken = () =>
  new AppException(
    'CONFLICT',
    'The account already has a goal',
    HttpStatus.CONFLICT,
    [{ field: 'accountId', message: 'У этого счёта уже есть цель' }],
  );

/** Whole months from one date to the other, both "YYYY-MM-DD". */
const monthsBetween = (from: string, to: string) =>
  (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
  (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));

/**
 * Saving up on one account: how far along it is, is the balance of that
 * account. Nothing to keep in step — money put aside and then spent leaves
 * the goal with it.
 */
@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async list(userId: string, now = new Date()): Promise<Goal[]> {
    const [goals, accounts, user] = await Promise.all([
      this.prisma.goal.findMany({
        where: { userId },
        orderBy: [
          { targetDate: { sort: 'asc', nulls: 'last' } },
          { name: 'asc' },
        ],
        select: goalSelect,
      }),
      // The balances as every other page sees them: one way of counting
      // money in the app, not a second one here.
      this.accounts.list(userId),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { timeZone: true },
      }),
    ]);

    const balances = new Map(
      accounts.items.map((account) => [account.id, account.balance]),
    );
    const today = todayIn(user.timeZone, now);
    return goals.map((goal) =>
      this.toGoal(goal, balances.get(goal.account.id) ?? '0', today),
    );
  }

  async create(userId: string, dto: GoalInputDto): Promise<Goal> {
    await this.checkAccount(userId, dto.accountId);
    try {
      await this.prisma.goal.create({
        data: { userId, ...this.columnsOf(dto) },
        select: { id: true },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.UniqueViolation)) throw taken();
      throw error;
    }
    return this.one(userId, dto.accountId);
  }

  /** The whole goal at once, the account it counts included. */
  async replace(userId: string, id: string, dto: GoalInputDto): Promise<Goal> {
    await this.checkAccount(userId, dto.accountId);
    try {
      const { count } = await this.prisma.goal.updateMany({
        where: { id, userId },
        data: this.columnsOf(dto),
      });
      if (count === 0) throw notFound();
    } catch (error) {
      if (isPrismaError(error, PrismaCode.UniqueViolation)) throw taken();
      throw error;
    }
    return this.one(userId, dto.accountId);
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.goal.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw notFound();
  }

  private async one(userId: string, accountId: string): Promise<Goal> {
    const goals = await this.list(userId);
    const goal = goals.find((item) => item.account.id === accountId);
    if (!goal) throw notFound();
    return goal;
  }

  /** The account is the user's; the foreign key would refuse it silently. */
  private async checkAccount(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) {
      throw invalid('accountId', 'Account not found', 'Счёт не найден');
    }
  }

  private columnsOf(dto: GoalInputDto) {
    return {
      accountId: dto.accountId,
      name: dto.name,
      targetAmount: dto.targetAmount,
      targetDate: dto.targetDate
        ? new Date(`${dto.targetDate}T00:00:00Z`)
        : null,
    };
  }

  /**
   * Decimal all the way: the client shows what the server counted. Percent
   * is rounded down, so 99.6% is not a reached goal; what to put aside
   * every month is rounded up, or the last month would fall short.
   */
  private toGoal(row: GoalRow, balance: string, today: string): Goal {
    const target = new Prisma.Decimal(row.targetAmount);
    const saved = Prisma.Decimal.max(new Prisma.Decimal(balance), 0);
    const remaining = Prisma.Decimal.max(target.minus(saved), 0);
    const targetDate = row.targetDate
      ? row.targetDate.toISOString().slice(0, 10)
      : null;

    let monthly: string | null = null;
    if (targetDate && remaining.greaterThan(0)) {
      // This month counts: a goal due at the end of the month is one month
      // of saving, not none.
      const months = monthsBetween(today, targetDate) + 1;
      if (months > 0) {
        monthly = remaining
          .div(months)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP)
          .toFixed(2);
      }
    }

    return {
      id: row.id,
      name: row.name,
      account: toAccountRef(row.account),
      targetAmount: target.toFixed(2),
      targetDate,
      saved: saved.toFixed(2),
      remaining: remaining.toFixed(2),
      percent: Math.min(100, saved.div(target).times(100).floor().toNumber()),
      monthly,
    };
  }
}
