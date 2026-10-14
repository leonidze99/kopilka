import { HttpStatus, Injectable } from '@nestjs/common';
import type { RenameTagDto, Tag } from '@kopilka/shared';
import type { Tx } from '../accounts/accounts.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const tagSelect = { id: true, name: true } as const;

const notFound = () =>
  new AppException('NOT_FOUND', 'Tag not found', HttpStatus.NOT_FOUND);

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<Tag[]> {
    return this.prisma.tag.findMany({
      where: { userId },
      select: tagSelect,
      orderBy: { nameKey: 'asc' },
    });
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
