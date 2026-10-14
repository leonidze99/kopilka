import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CategoryTotal,
  CategoryTotalsQuery,
  ExportTransactionsQuery,
  ListTransactionsQuery,
  MonthlyTotal,
  MonthlyTotalsQuery,
  TagTotal,
  TagTotalsQuery,
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
import { receiptSelect } from '../receipts/receipts.service.js';
import { tagSelect, TagsService } from '../tags/tags.service.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import { categorizedAmount, categorizedJoin } from './parts.js';

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
  splits: {
    select: { amount: true, category: { select: categorySelect } },
    orderBy: [{ amount: 'desc' }, { category: { name: 'asc' } }],
  },
  tags: {
    select: { tag: { select: tagSelect } },
    orderBy: { tag: { nameKey: 'asc' } },
  },
  receipts: { select: receiptSelect, orderBy: { createdAt: 'asc' } },
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
  splits,
  tags,
  ...row
}: TransactionRow): Transaction {
  const common = {
    ...row,
    amount: row.amount.toFixed(2),
    tags: tags.map(({ tag }) => tag),
  };
  if (toAccount) return { type: 'transfer', ...common, toAccount };
  // Without a category there are parts (the deferred trigger checks it),
  // all of one kind (the service does).
  const kind = category?.kind ?? splits[0]?.category.kind;
  if (!kind) throw new Error(`Transaction ${row.id} has no category`);
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
  new AppException('NOT_FOUND', 'Transaction not found', HttpStatus.NOT_FOUND);

/** For the totals: only the transactions with this tag. */
const tagged = (tagId: string) => Prisma.sql`EXISTS (
  SELECT 1 FROM transaction_tags tt
  WHERE tt.transaction_id = t.id AND tt.tag_id = ${tagId}::uuid
)`;

/**
 * As transactions.comment_search is generated: lower case, ё as е. JS
 * lowercases Cyrillic like Postgres under a UTF-8 locale.
 *
 * Prisma's `contains` becomes LIKE '%…%' without escaping the pattern:
 * a typed "100%" would also match "1005", "__" anything. Backslash is
 * LIKE's default escape character.
 */
const searchable = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[\\%_]/g, (char) => `\\${char}`);

const invalid = (field: string, message: string, detail: string) =>
  new AppException('VALIDATION_FAILED', message, HttpStatus.BAD_REQUEST, [
    { field, message: detail },
  ]);

const unknownAccount = (field: string) =>
  invalid(field, 'Account not found', 'Счёт не найден');

const unknownCategory = (field = 'categoryId') =>
  invalid(field, 'Category not found', 'Категория не найдена');

type CategorizedInput = Exclude<TransactionInputDto, { type: 'transfer' }>;

/**
 * The categories an income or expense counts in, with the field naming
 * each: its own, or those of its parts.
 */
const categoriesOf = (dto: CategorizedInput) =>
  dto.splits
    ? dto.splits.map((split, index) => ({
        id: split.categoryId,
        field: `splits.${index}.categoryId`,
      }))
    : // The schema requires one of the two.
      [{ id: dto.categoryId!, field: 'categoryId' }];

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
  // A split transaction has its categories in its parts.
  categoryId: dto.type === 'transfer' ? null : (dto.categoryId ?? null),
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
    private readonly tags: TagsService,
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
    const rows = await this.prisma.transaction.findMany({
      // (occurred_at, id) < (cursor.occurredAt, cursor.id); id breaks ties
      // between transactions with the same timestamp.
      where: this.filters(
        userId,
        query,
        cursor
          ? [
              {
                OR: [
                  { occurredAt: { lt: cursor.occurredAt } },
                  { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
                ],
              },
            ]
          : [],
      ),
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

  /** What the feed shows, as a Prisma filter; `extra` adds the cursor. */
  private filters(
    userId: string,
    query: Omit<ListTransactionsQuery, 'cursor' | 'limit'>,
    extra: Prisma.TransactionWhereInput[] = [],
  ): Prisma.TransactionWhereInput {
    const and = [...extra];
    // A split transaction is in the category, and of the kind, of its parts.
    if (query.categoryId) {
      and.push({
        OR: [
          { categoryId: query.categoryId },
          { splits: { some: { categoryId: query.categoryId } } },
        ],
      });
    }
    if (query.type === 'income' || query.type === 'expense') {
      and.push({
        OR: [
          { category: { kind: query.type } },
          { splits: { some: { category: { kind: query.type } } } },
        ],
      });
    }
    if (query.tagId) and.push({ tags: { some: { tagId: query.tagId } } });
    // A transfer belongs to both of its accounts.
    if (query.accountId) {
      and.push({
        OR: [{ accountId: query.accountId }, { toAccountId: query.accountId }],
      });
    }
    return {
      userId,
      // LIKE '%…%' on the generated comment_search column, which the
      // trigram index serves; the query is normalized the same way.
      ...(query.q && { commentSearch: { contains: searchable(query.q) } }),
      ...(query.type === 'transfer' && { toAccountId: { not: null } }),
      occurredAt: { gte: query.from, lt: query.to },
      AND: and,
    };
  }

  /**
   * Everything matching the filter, oldest first, a batch at a time: an
   * export can be a year of rows, and building the whole file in memory is
   * how a process runs out of it. Keyset paging as in the feed, so rows
   * written meanwhile cannot shift a later batch and duplicate a row; the
   * index on (user_id, occurred_at DESC, id DESC) serves this order too,
   * scanned backwards.
   */
  async *exportRows(
    userId: string,
    query: ExportTransactionsQuery,
  ): AsyncGenerator<Transaction[]> {
    const batchSize = 500;
    let after: { occurredAt: Date; id: string } | undefined;

    for (;;) {
      const rows = await this.prisma.transaction.findMany({
        where: this.filters(
          userId,
          query,
          after
            ? [
                {
                  OR: [
                    { occurredAt: { gt: after.occurredAt } },
                    { occurredAt: after.occurredAt, id: { gt: after.id } },
                  ],
                },
              ]
            : [],
        ),
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: batchSize,
        select: transactionSelect,
      });
      if (rows.length === 0) return;

      yield rows.map(toTransaction);
      if (rows.length < batchSize) return;
      const last = rows[rows.length - 1]!;
      after = { occurredAt: last.occurredAt, id: last.id };
    }
  }

  /**
   * Totals are summed by Postgres in numeric: exact, unlike floats in JS.
   * The JOIN with categories leaves transfers out: moving money between
   * one's own accounts is neither income nor expense. A split transaction
   * counts once: its parts add up to its amount.
   */
  async summary(
    userId: string,
    { from, to, tagId }: TransactionSummaryQuery,
  ): Promise<TransactionSummary> {
    const conditions = [Prisma.sql`t.user_id = ${userId}::uuid`];
    if (from) conditions.push(Prisma.sql`t.occurred_at >= ${from}`);
    if (to) conditions.push(Prisma.sql`t.occurred_at < ${to}`);
    if (tagId) conditions.push(tagged(tagId));

    const rows = await this.prisma.$queryRaw<
      { kind: TransactionKind; total: Prisma.Decimal }[]
    >`
      SELECT c.kind, SUM(${categorizedAmount}) AS total
      FROM transactions t
      ${categorizedJoin}
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
   * small however many transactions there are. A split transaction counts
   * in each category of its parts, with the part's amount.
   */
  async byCategory(
    userId: string,
    { from, to, kind, tagId }: CategoryTotalsQuery,
  ): Promise<CategoryTotal[]> {
    const conditions = [
      Prisma.sql`t.user_id = ${userId}::uuid`,
      Prisma.sql`c.kind = ${kind}::transaction_kind`,
    ];
    if (from) conditions.push(Prisma.sql`t.occurred_at >= ${from}`);
    if (to) conditions.push(Prisma.sql`t.occurred_at < ${to}`);
    if (tagId) conditions.push(tagged(tagId));

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        kind: TransactionKind;
        name: string;
        total: Prisma.Decimal;
      }[]
    >`
      SELECT c.id, c.kind, c.name, SUM(${categorizedAmount}) AS total
      FROM transactions t
      ${categorizedJoin}
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
   * Totals per tag of one kind, largest first; only tags with transactions
   * in the period. A transaction with two tags counts in both, so the
   * totals overlap. Parts of a split one count through categorizedJoin:
   * the tag is on the whole transaction, its parts add up to it.
   */
  async byTag(
    userId: string,
    { from, to, kind }: TagTotalsQuery,
  ): Promise<TagTotal[]> {
    const conditions = [
      Prisma.sql`t.user_id = ${userId}::uuid`,
      Prisma.sql`c.kind = ${kind}::transaction_kind`,
    ];
    if (from) conditions.push(Prisma.sql`t.occurred_at >= ${from}`);
    if (to) conditions.push(Prisma.sql`t.occurred_at < ${to}`);

    const rows = await this.prisma.$queryRaw<
      { id: string; name: string; total: Prisma.Decimal }[]
    >`
      SELECT g.id, g.name, SUM(${categorizedAmount}) AS total
      FROM transactions t
      JOIN transaction_tags tt ON tt.transaction_id = t.id
      JOIN tags g ON g.id = tt.tag_id
      ${categorizedJoin}
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY g.id
      ORDER BY total DESC, g.name_key
    `;

    return rows.map(({ total, ...tag }) => ({
      tag,
      total: new Prisma.Decimal(total).toFixed(2),
    }));
  }

  /**
   * Income and expense of every month in [from, to], zeros included.
   *
   * - generate_series makes the months, so a month without transactions
   *   is a row of zeros rather than a gap the client would have to fill.
   * - The period filter is a range on occurred_at itself, its bounds
   *   computed once: the (user_id, occurred_at) index finds the rows. A
   *   condition on date_trunc(occurred_at) could not use that index.
   * - Months are the user's: occurred_at AT TIME ZONE gives the local wall
   *   time, date_trunc its month.
   */
  async monthly(
    userId: string,
    { from, to, timeZone }: MonthlyTotalsQuery,
  ): Promise<MonthlyTotal[]> {
    const rows = await this.prisma.$queryRaw<
      { month: string; income: Prisma.Decimal; expense: Prisma.Decimal }[]
    >`
      WITH months AS (
        SELECT generate_series(${`${from}-01`}::date, ${`${to}-01`}::date, interval '1 month')::date AS month
      ),
      totals AS (
        SELECT date_trunc('month', t.occurred_at AT TIME ZONE ${timeZone})::date AS month,
               SUM(${categorizedAmount}) FILTER (WHERE c.kind = 'income') AS income,
               SUM(${categorizedAmount}) FILTER (WHERE c.kind = 'expense') AS expense
        FROM transactions t
        ${categorizedJoin}
        WHERE t.user_id = ${userId}::uuid
          AND t.occurred_at >= (${`${from}-01`}::date::timestamp AT TIME ZONE ${timeZone})
          AND t.occurred_at < ((${`${to}-01`}::date + interval '1 month') AT TIME ZONE ${timeZone})
        GROUP BY 1
      )
      SELECT to_char(m.month, 'YYYY-MM') AS month,
             COALESCE(t.income, 0) AS income,
             COALESCE(t.expense, 0) AS expense
      FROM months m
      LEFT JOIN totals t ON t.month = m.month
      ORDER BY m.month
    `;

    return rows.map((row) => {
      const income = new Prisma.Decimal(row.income);
      const expense = new Prisma.Decimal(row.expense);
      return {
        month: row.month,
        income: income.toFixed(2),
        expense: expense.toFixed(2),
        balance: income.minus(expense).toFixed(2),
      };
    });
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
      await this.checkCategories(tx, userId, dto);
      const { id } = await tx.transaction.create({
        data: { userId, ...columnsOf(dto) },
        select: { id: true },
      });
      await this.writeSplits(tx, userId, id, dto);
      await this.writeTags(tx, userId, id, dto.tags);
      await this.accounts.assertNotNegative(
        tx,
        userId,
        accounts.map((account) => account.id),
        'amount',
      );
      return this.read(tx, userId, id);
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
      await this.checkCategories(tx, userId, dto);
      await tx.transaction.update({
        where: { id, userId },
        data: columnsOf(dto),
        select: { id: true },
      });
      // The parts are replaced as a whole, as the transaction is.
      await tx.transactionSplit.deleteMany({ where: { transactionId: id } });
      await this.writeSplits(tx, userId, id, dto);
      await this.writeTags(tx, userId, id, dto.tags);
      await this.accounts.assertNotNegative(
        tx,
        userId,
        accounts.map((account) => account.id),
        'amount',
      );
      return this.read(tx, userId, id);
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

  /** Its tags, by name, as the only ones: new names become new tags. */
  private async writeTags(
    tx: Tx,
    userId: string,
    transactionId: string,
    names: string[],
  ) {
    await tx.transactionTag.deleteMany({ where: { transactionId } });
    const tagIds = await this.tags.resolve(tx, userId, names);
    await tx.transactionTag.createMany({
      data: tagIds.map((tagId) => ({ transactionId, tagId, userId })),
    });
  }

  /** The parts of a split transaction; nothing for any other. */
  private async writeSplits(
    tx: Tx,
    userId: string,
    transactionId: string,
    dto: TransactionInputDto,
  ) {
    if (dto.type === 'transfer' || !dto.splits) return;
    await tx.transactionSplit.createMany({
      data: dto.splits.map((split) => ({
        transactionId,
        userId,
        categoryId: split.categoryId,
        amount: split.amount,
      })),
    });
  }

  /** The transaction as written, with its parts. */
  private async read(tx: Tx, userId: string, id: string) {
    const row = await tx.transaction.findUniqueOrThrow({
      where: { id, userId },
      select: transactionSelect,
    });
    return toTransaction(row);
  }

  /**
   * The composite foreign key rejects another user's category, but not
   * one of the other kind: an "expense" in a salary category. One query
   * for all the categories of a split transaction.
   */
  private async checkCategories(
    tx: Tx,
    userId: string,
    dto: TransactionInputDto,
  ) {
    if (dto.type === 'transfer') return;
    const wanted = categoriesOf(dto);
    const found = await tx.category.findMany({
      where: { userId, id: { in: wanted.map((category) => category.id) } },
      select: { id: true, kind: true },
    });
    const kinds = new Map(found.map(({ id, kind }) => [id, kind]));
    for (const { id, field } of wanted) {
      const kind = kinds.get(id);
      if (!kind) throw unknownCategory(field);
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
