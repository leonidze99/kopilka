import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Category,
  CreateCategoryDto,
  UpdateCategoryDto,
} from '@kopilka/shared';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaCode, isPrismaError } from '../prisma/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const categorySelect = { id: true, kind: true, name: true } as const;

// Another user's category is reported exactly like a missing one:
// a 403 would confirm that the id exists.
const notFound = () =>
  new AppException('NOT_FOUND', 'Category not found', HttpStatus.NOT_FOUND);

const nameTaken = () =>
  new AppException(
    'CONFLICT',
    'Category with this name already exists',
    HttpStatus.CONFLICT,
    [{ field: 'name', message: 'Категория с таким названием уже есть' }],
  );

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { userId },
      select: categorySelect,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    try {
      return await this.prisma.category.create({
        data: { userId, kind: dto.kind, name: dto.name },
        select: categorySelect,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.UniqueViolation)) throw nameTaken();
      throw error;
    }
  }

  async rename(
    userId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    try {
      // The composite key in `where` scopes the update to the owner.
      return await this.prisma.category.update({
        where: { id_userId: { id, userId } },
        data: { name: dto.name },
        select: categorySelect,
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      if (isPrismaError(error, PrismaCode.UniqueViolation)) throw nameTaken();
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    try {
      await this.prisma.category.delete({
        where: { id_userId: { id, userId } },
      });
    } catch (error) {
      if (isPrismaError(error, PrismaCode.NotFound)) throw notFound();
      // ON DELETE RESTRICT: the database refuses while transactions use it.
      if (isPrismaError(error, PrismaCode.ForeignKeyViolation)) {
        throw new AppException(
          'CATEGORY_IN_USE',
          'Category has transactions',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }
}
