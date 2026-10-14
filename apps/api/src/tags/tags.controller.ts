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
  Put,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type RenameTagDto,
  renameTagSchema,
  type SetTagBudgetDto,
  setTagBudgetSchema,
  type Tag,
  type TagDetails,
  tagDetailsSchema,
  tagSchema,
} from '@kopilka/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { TagsService } from './tags.service.js';

const tagListSchema = z.array(tagDetailsSchema);

// No POST: a tag is made by naming it on a transaction.
@ApiTags('tags')
@ApiErrorResponses(401)
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({
    summary: 'Tags of the user, by name, with their budgets',
    description:
      'A budget is a limit over all time; spent counts the expenses with the tag.',
  })
  @ApiOkResponse({ standardSchema: tagListSchema })
  list(@CurrentUser() user: AuthUser): Promise<TagDetails[]> {
    return this.tags.list(user.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Rename a tag',
    description:
      'Refused with CONFLICT if another tag has the name (case and ё/е aside).',
  })
  @ApiOkResponse({ standardSchema: tagSchema })
  @ApiErrorResponses(400, 404, 409)
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: renameTagSchema }) dto: RenameTagDto,
  ): Promise<Tag> {
    return this.tags.rename(user.id, id, dto);
  }

  @Put(':id/budget')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set the budget of a tag',
    description:
      'What the tag may cost over all time. `amount: null` takes the limit off.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(400, 404)
  setBudget(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: setTagBudgetSchema }) dto: SetTagBudgetDto,
  ): Promise<void> {
    return this.tags.setBudget(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a tag',
    description: 'Its transactions stay, without it.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tags.remove(user.id, id);
  }
}
