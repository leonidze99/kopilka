import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type Category,
  categorySchema,
  type CreateCategoryDto,
  createCategorySchema,
  type UpdateCategoryDto,
  updateCategorySchema,
} from '@kopilka/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { CategoriesService } from './categories.service.js';

const categoryListSchema = z.array(categorySchema);

@ApiTags('categories')
@ApiErrorResponses(401)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Categories of the user, by kind and name' })
  @ApiOkResponse({ standardSchema: categoryListSchema })
  list(@CurrentUser() user: AuthUser): Promise<Category[]> {
    return this.categories.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiCreatedResponse({ standardSchema: categorySchema })
  @ApiErrorResponses(400, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createCategorySchema }) dto: CreateCategoryDto,
  ): Promise<Category> {
    return this.categories.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a category (its kind is fixed)' })
  @ApiOkResponse({ standardSchema: categorySchema })
  @ApiErrorResponses(400, 404, 409)
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateCategorySchema }) dto: UpdateCategoryDto,
  ): Promise<Category> {
    return this.categories.rename(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category',
    description: 'Refused with CATEGORY_IN_USE while transactions use it.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.categories.remove(user.id, id);
  }
}
