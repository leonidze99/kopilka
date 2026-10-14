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
  type Tag,
  tagSchema,
} from '@kopilka/shared';
import { z } from 'zod';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { TagsService } from './tags.service.js';

const tagListSchema = z.array(tagSchema);

// No POST: a tag is made by naming it on a transaction.
@ApiTags('tags')
@ApiErrorResponses(401)
@Controller('tags')
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  @ApiOperation({ summary: 'Tags of the user, by name' })
  @ApiOkResponse({ standardSchema: tagListSchema })
  list(@CurrentUser() user: AuthUser): Promise<Tag[]> {
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
