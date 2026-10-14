import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  RenameTagDto,
  SetTagBudgetDto,
  Tag,
  TagDetails,
} from '@kopilka/shared';
import type { Tx } from '../accounts/accounts.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { tagSpent } from '../transactions/parts.js';

export const tagSelect = { id: true, name: true } as const;

const notFound = () =>
  new AppException('NOT_FOUND', 'Tag not found', HttpStatus.NOT_FOUND);

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * By name, each with its budget. What a budgeted tag has cost is summed
   * by Postgres over all time (tagSpent), for tags with a limit only.
   */
  async list(userId: string): Promise<TagDetails[]> {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        budget: Prisma.Decimal | null;
        spent: Prisma.Decimal | null;
      }[]
    >`
      SELECT g.id, g.name, g.budget,
             CASE WHEN g.budget IS NOT NULL
               THEN ${tagSpent(Prisma.sql`g.id`)} END AS spent
      FROM tags g
      WHERE g.user_id = ${userId}::uuid
      ORDER BY g.name_key
    `;

    return rows.map(({ id, name, budget, spent }) => {
      if (budget === null) return { id, name, budget: null };
      const limit = new Prisma.Decimal(budget);
      const used = new Prisma.Decimal(spent ?? 0);
      return {
        id,
        name,
        budget: {
          limit: limit.toFixed(2),
          spent: used.toFixed(2),
          remaining: limit.minus(used).toFixed(2),
        },
      };
    });
  }

  /** One limit per tag, replaced; `amount: null` takes it off. */
  async setBudget(
    userId: string,
    id: string,
    { amount }: SetTagBudgetDto,
  ): Promise<void> {
    try {
      await this.prisma.tag.update({
        where: { id_userId: { id, userId } },
        data: { budget: amount },
        select: { id: true },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      throw error;
    }
  }

  /**
   * A new name only: renaming "Отпуск" to a name another tag has is
   * refused, not a merge — the user may not mean to join them.
   */
  async rename(userId: string, id: string, dto: RenameTagDto): Promise<Tag> {
    try {
      return await this.prisma.tag.update({
        where: { id_userId: { id, userId } },
        data: { name: dto.name },
        select: tagSelect,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      if (isPrismaError(error, PrismaCode.UniqueViolation)) {
        throw new AppException(
          'CONFLICT',
          'Tag with this name already exists',
          HttpStatus.CONFLICT,
          [{ field: 'name', message: 'Тег с таким названием уже есть' }],
        );
      }
      throw error;
    }
  }

  /** Takes it off its transactions too: a tag is a label, never in use. */
  async remove(userId: string, id: string): Promise<void> {
    try {
      await this.prisma.tag.delete({ where: { id_userId: { id, userId } } });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      throw error;
    }
  }

  /**
   * The ids of the tags named, made if new. ON CONFLICT DO NOTHING on
   * (user_id, name_key) keeps an existing tag and its spelling, and makes
   * two concurrent writes with the same new name one tag: the second
   * insert waits for the first and then does nothing. The read is a new
   * statement, so it sees the tag either way. Names are matched by the
   * key Postgres folds, never by JS: lower() follows the database locale.
   */
  async resolve(tx: Tx, userId: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    await tx.tag.createMany({
      data: names.map((name) => ({ userId, name })),
      skipDuplicates: true,
    });
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM tags
      WHERE user_id = ${userId}::uuid
        AND name_key IN (
          SELECT lower(translate(name, 'ёЁ', 'еЕ'))
          FROM unnest(${names}::text[]) AS name
        )
    `;
    return rows.map((row) => row.id);
  }
}
