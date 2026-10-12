import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type BudgetList,
  budgetListSchema,
  type BudgetsQuery,
  budgetsQuerySchema,
  type SetBudgetDto,
  setBudgetSchema,
} from '@kopilka/shared';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { BudgetsService } from './budgets.service.js';

@ApiTags('budgets')
@ApiErrorResponses(401)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @ApiOperation({
    summary: 'Limits that apply in a month, with what was spent',
    description:
      '`from`/`to` are the bounds of `month` in the user’s time zone.',
  })
  @ApiOkResponse({ standardSchema: budgetListSchema })
  @ApiErrorResponses(400)
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: budgetsQuerySchema }) query: BudgetsQuery,
  ): Promise<BudgetList> {
    return this.budgets.list(user.id, query);
  }

  @Put(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Set the limit of a category from a month on',
    description:
      'Applies until the next change; earlier months keep their limits. `amount: null` stops the budget from that month.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(400, 404)
  set(
    @CurrentUser() user: AuthUser,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body({ schema: setBudgetSchema }) dto: SetBudgetDto,
  ): Promise<void> {
    return this.budgets.set(user.id, categoryId, dto);
  }
}
