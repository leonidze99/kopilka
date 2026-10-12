import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { minutes, Throttle } from '@nestjs/throttler';
import {
  type Import,
  type ImportCommitDto,
  importCommitSchema,
  type ImportMappingDto,
  importMappingSchema,
  importSchema,
  type ImportSummary,
  importSummaryListSchema,
} from '@kopilka/shared';
import type { Request } from 'express';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { MAX_FILE_BYTES } from './csv-upload.js';
import { ImportsService } from './imports.service.js';

@ApiTags('imports')
@ApiErrorResponses(401)
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  @ApiOperation({ summary: 'Recent imports, newest first' })
  @ApiOkResponse({ standardSchema: importSummaryListSchema })
  list(@CurrentUser() user: AuthUser): Promise<ImportSummary[]> {
    return this.imports.list(user.id);
  }

  @Post()
  // Each upload streams a file into the database: fewer than other writes.
  @Throttle({ default: { limit: 10, ttl: minutes(1) } })
  @ApiOperation({
    summary: 'Upload a bank statement (CSV)',
    description: `UTF-8 or Windows-1251, delimiter detected, the first line is the header. Up to ${MAX_FILE_BYTES / 1024 / 1024} MB. Known bank formats come back with \`preset\` and the columns filled in.`,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ standardSchema: importSchema })
  @ApiErrorResponses(400, 413, 429)
  upload(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<Import> {
    return this.imports.upload(user.id, req);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'An import: its rows, progress and summary',
    description: 'Poll while `status` is `parsing` or `importing`.',
  })
  @ApiOkResponse({ standardSchema: importSchema })
  @ApiErrorResponses(404)
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Import> {
    return this.imports.get(user.id, id);
  }

  @Put(':id/mapping')
  @ApiOperation({
    summary: 'Choose the columns and the account',
    description:
      'Parses the rows in the background (`parsing` → `ready`) and finds those already imported into the account. May be sent again to read the file differently.',
  })
  @ApiOkResponse({ standardSchema: importSchema })
  @ApiErrorResponses(400, 404, 409)
  setMapping(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: importMappingSchema }) dto: ImportMappingDto,
  ): Promise<Import> {
    return this.imports.setMapping(user.id, id, dto);
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Choose the categories and import',
    description:
      'Creates the transactions in the background (`importing` → `done`), all or none. If the account must not go negative and would, the import goes back to `ready` with `error`. The categories are remembered for the next import.',
  })
  @ApiOkResponse({ standardSchema: importSchema })
  @ApiErrorResponses(400, 404, 409)
  commit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: importCommitSchema }) dto: ImportCommitDto,
  ): Promise<Import> {
    return this.imports.commit(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Discard an import',
    description: 'Not once it is importing or done.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.imports.remove(user.id, id);
  }
}
