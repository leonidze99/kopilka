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
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type CreateTransactionDto,
  createTransactionSchema,
  type ListTransactionsQuery,
  listTransactionsQuerySchema,
  type Transaction,
  type TransactionPage,
  transactionPageSchema,
  transactionSchema,
  type TransactionSummary,
  type TransactionSummaryQuery,
  transactionSummaryQuerySchema,
  transactionSummarySchema,
  type UpdateTransactionDto,
  updateTransactionSchema,
} from '@kopilka/shared';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { TransactionsService } from './transactions.service.js';

@ApiTags('transactions')
@ApiErrorResponses(401)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Transactions, newest first, a page at a time',
    description:
      'Cursor pagination: pass `nextCursor` of a page as `cursor` to get the next one.',
  })
  @ApiOkResponse({ standardSchema: transactionPageSchema })
  @ApiErrorResponses(400)
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listTransactionsQuerySchema })
    query: ListTransactionsQuery,
  ): Promise<TransactionPage> {
    return this.transactions.list(user.id, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Income, expense and balance over a period' })
  @ApiOkResponse({ standardSchema: transactionSummarySchema })
  @ApiErrorResponses(400)
  summary(
    @CurrentUser() user: AuthUser,
    @Query({ schema: transactionSummaryQuerySchema })
    query: TransactionSummaryQuery,
  ): Promise<TransactionSummary> {
    return this.transactions.summary(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Record an income or an expense' })
  @ApiCreatedResponse({ standardSchema: transactionSchema })
  @ApiErrorResponses(400)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTransactionSchema }) dto: CreateTransactionDto,
  ): Promise<Transaction> {
    return this.transactions.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change a transaction' })
  @ApiOkResponse({ standardSchema: transactionSchema })
  @ApiErrorResponses(400, 404)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateTransactionSchema }) dto: UpdateTransactionDto,
  ): Promise<Transaction> {
    return this.transactions.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a transaction' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.transactions.remove(user.id, id);
  }
}
