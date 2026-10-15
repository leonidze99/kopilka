import { HttpStatus, Injectable } from '@nestjs/common';
import type { RecurringInputDto, RecurringRule } from '@kopilka/shared';
import {
  accountRefSelect,
  assertNotArchived,
  toAccountRef,
} from '../accounts/accounts.service.js';
import { categorySelect } from '../categories/categories.service.js';
import { AppException } from '../common/errors/app.exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  addDays,
  dateOf,
  firstOnOrAfter,
  toDateColumn,
  todayIn,
} from './schedule.js';

const ruleSelect = {
  id: true,
  amount: true,
  comment: true,
  startOn: true,
  every: true,
  unit: true,
  timeZone: true,
  active: true,
  nextOn: true,
  lastError: true,
  account: { select: accountRefSelect },
  toAccount: { select: accountRefSelect },
  category: { select: categorySelect },
  splits: {
    select: { amount: true, category: { select: categorySelect } },
    orderBy: [{ amount: 'desc' }, { category: { name: 'asc' } }],
  },
} satisfies Prisma.RecurringRuleSelect;

type RuleRow = Prisma.RecurringRuleGetPayload<{ select: typeof ruleSelect }>;

function toRule({
  toAccount,
  category,
  splits,
  ...row
}: RuleRow): RecurringRule {
  const common = {
    ...row,
    account: toAccountRef(row.account),
    amount: row.amount.toFixed(2),
    startOn: dateOf(row.startOn),
    nextOn: dateOf(row.nextOn),
  };
  if (toAccount) {
    return { type: 'transfer', ...common, toAccount: toAccountRef(toAccount) };
  }
  // Without a category there are parts, all of one kind (the service
  // writes nothing else).
  const kind = category?.kind ?? splits[0]?.category.kind;
  if (!kind) throw new Error(`Recurring rule ${row.id} has no category`);
  return {
    type: kind,
    ...common,
    category,
    splits: splits.map((split) => ({
      category: split.category,
      amount: split.amount.toFixed(2),
    })),
  };
}

const notFound = () =>
  new AppException(
    'NOT_FOUND',
    'Recurring rule not found',
    HttpStatus.NOT_FOUND,
  );

const invalid = (field: string, message: string, detail: string) =>
  new AppException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST, [
    { field, message: detail },
  ]);

@Injectable()
export class RecurringService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<RecurringRule[]> {
    const rows = await this.prisma.recurringRule.findMany({
      where: { userId },
      select: ruleSelect,
      orderBy: [{ active: 'desc' }, { nextOn: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toRule);
  }

  async create(userId: string, dto: RecurringInputDto): Promise<RecurringRule> {
    await this.checkRefs(userId, dto);
    const row = await this.write(() =>
      this.prisma.recurringRule.create({
        data: {
          userId,
          ...this.columnsOf(dto, this.scheduleOf(dto)),
          splits: { create: this.splitsOf(userId, dto) },
        },
        select: ruleSelect,
      }),
    );
    return toRule(row);
  }

  /**
   * Replaces the rule. The schedule restarts from today, after the last
   * payment it already made: an edit never makes one twice.
   */
  async replace(
    userId: string,
    id: string,
    dto: RecurringInputDto,
  ): Promise<RecurringRule> {
    await this.checkRefs(userId, dto);
    const last = await this.prisma.transaction.findFirst({
      where: { recurringRuleId: id, userId },
      orderBy: { recurringOn: 'desc' },
      select: { recurringOn: true },
    });
    const schedule = this.scheduleOf(
      dto,
      last?.recurringOn ? addDays(dateOf(last.recurringOn), 1) : undefined,
    );
    const row = await this.write(() =>
      this.prisma.recurringRule.update({
        where: { id, userId },
        // A fresh start: the last error was about the old settings.
        data: {
          ...this.columnsOf(dto, schedule),
          lastError: null,
          // The parts are replaced as a whole, as the rule is.
          splits: { deleteMany: {}, create: this.splitsOf(userId, dto) },
        },
        select: ruleSelect,
      }),
    );
    return toRule(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    // Transactions it made stay: their link is set to NULL.
    await this.write(() =>
      this.prisma.recurringRule.delete({ where: { id, userId } }),
    );
  }

  /**
   * The next payment: the first on or after today in the rule's zone (past
   * dates are not filled in: they may have been entered by hand), and after
   * `notBefore` if given.
   */
  private scheduleOf(dto: RecurringInputDto, notBefore?: string) {
    const today = todayIn(dto.timeZone, new Date());
    const from = [dto.startOn, today, notBefore ?? ''].sort().at(-1) as string;
    const { index, on } = firstOnOrAfter(dto.startOn, from, {
      every: dto.every,
      unit: dto.unit,
    });
    return { nextIndex: index, nextOn: toDateColumn(on) };
  }

  /** The parts of a split rule; none for any other. */
  private splitsOf(userId: string, dto: RecurringInputDto) {
    if (dto.type === 'transfer' || !dto.splits) return [];
    return dto.splits.map((split) => ({
      userId,
      categoryId: split.categoryId,
      amount: split.amount,
    }));
  }

  private columnsOf(
    dto: RecurringInputDto,
    schedule: { nextIndex: number; nextOn: Date },
  ) {
    return {
      accountId: dto.accountId,
      // A split rule has its categories in its parts.
      categoryId: dto.type === 'transfer' ? null : (dto.categoryId ?? null),
      toAccountId: dto.type === 'transfer' ? dto.toAccountId : null,
      amount: dto.amount,
      comment: dto.comment || null,
      startOn: toDateColumn(dto.startOn),
      every: dto.every,
      unit: dto.unit,
      timeZone: dto.timeZone,
      active: dto.active,
      ...schedule,
    };
  }

  /**
   * The user's own accounts and a category of the right kind, each error
   * under its field. The composite foreign keys would refuse another
   * user's ids too, but without telling which one.
   */
  private async checkRefs(userId: string, dto: RecurringInputDto) {
    const accountIds = [
      dto.accountId,
      ...(dto.type === 'transfer' ? [dto.toAccountId] : []),
    ];
    const owned = await this.prisma.account.findMany({
      where: { userId, id: { in: accountIds } },
      select: { id: true, currency: true, archivedAt: true },
    });
    const currencies = new Map(owned.map(({ id, currency }) => [id, currency]));
    const found = new Set(currencies.keys());
    if (!found.has(dto.accountId)) {
      throw invalid('accountId', 'Account not found', 'Счёт не найден');
    }
    // A stopped rule may stay on an archived account; a running one would
    // write onto it.
    if (dto.active) {
      assertNotArchived(
        new Set(owned.filter((a) => a.archivedAt).map((a) => a.id)),
        [
          { id: dto.accountId, field: 'accountId' },
          ...(dto.type === 'transfer'
            ? [{ id: dto.toAccountId, field: 'toAccountId' }]
            : []),
        ],
      );
    }
    if (dto.type === 'transfer') {
      if (!found.has(dto.toAccountId)) {
        throw invalid('toAccountId', 'Account not found', 'Счёт не найден');
      }
      // What arrives depends on the bank's rate of each day: a rule cannot
      // know it in advance.
      if (currencies.get(dto.accountId) !== currencies.get(dto.toAccountId)) {
        throw invalid(
          'toAccountId',
          'Recurring transfer between currencies',
          'Регулярный перевод — только между счетами в одной валюте',
        );
      }
      return;
    }
    // Its own category, or those of its parts: one query for all.
    const wanted = dto.splits
      ? dto.splits.map((split, index) => ({
          id: split.categoryId,
          field: `splits.${index}.categoryId`,
        }))
      : [{ id: dto.categoryId!, field: 'categoryId' }];
    const categories = await this.prisma.category.findMany({
      where: { userId, id: { in: wanted.map((category) => category.id) } },
      select: { id: true, kind: true },
    });
    const kinds = new Map(categories.map(({ id, kind }) => [id, kind]));
    for (const { id, field } of wanted) {
      const kind = kinds.get(id);
      if (!kind) {
        throw invalid(field, 'Category not found', 'Категория не найдена');
      }
      if (kind !== dto.type) {
        throw invalid(
          field,
          'Category of another kind',
          dto.type === 'income'
            ? 'Это категория расходов'
            : 'Это категория доходов',
        );
      }
    }
  }

  private async write<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      // An account or the category was deleted after the check.
      if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
        throw invalid('accountId', 'Account not found', 'Счёт не найден');
      }
      throw error;
    }
  }
}
