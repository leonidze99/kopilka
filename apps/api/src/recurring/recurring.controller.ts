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
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type RecurringInputDto,
  recurringInputSchema,
  type RecurringRule,
  recurringRuleListSchema,
  recurringRuleSchema,
} from '@kopilka/shared';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { RecurringService } from './recurring.service.js';

@ApiTags('recurring')
@ApiErrorResponses(401)
@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  @ApiOperation({ summary: 'Recurring rules: active first, by next payment' })
  @ApiOkResponse({ standardSchema: recurringRuleListSchema })
  list(@CurrentUser() user: AuthUser): Promise<RecurringRule[]> {
    return this.recurring.list(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a monthly income, expense or transfer',
    description:
      'The server makes each payment once its day begins in `timeZone`. Dates before today are not filled in.',
  })
  @ApiCreatedResponse({ standardSchema: recurringRuleSchema })
  @ApiErrorResponses(400)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: recurringInputSchema }) dto: RecurringInputDto,
  ): Promise<RecurringRule> {
    return this.recurring.create(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Replace a recurring rule',
    description:
      'The schedule restarts from today, after the last payment already made.',
  })
  @ApiOkResponse({ standardSchema: recurringRuleSchema })
  @ApiErrorResponses(400, 404)
  replace(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: recurringInputSchema }) dto: RecurringInputDto,
  ): Promise<RecurringRule> {
    return this.recurring.replace(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a recurring rule',
    description: 'Transactions it already made stay.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.recurring.remove(user.id, id);
  }
}
