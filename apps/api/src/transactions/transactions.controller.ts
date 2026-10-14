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
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { once } from 'node:events';
import type { Response } from 'express';
import {
  type CategoryTotal,
  type CategoryTotalsQuery,
  categoryTotalsQuerySchema,
  categoryTotalsSchema,
  type ExportTransactionsQuery,
  exportTransactionsQuerySchema,
  type ListTransactionsQuery,
  listTransactionsQuerySchema,
  type MonthlyTotal,
  type MonthlyTotalsQuery,
  monthlyTotalsQuerySchema,
  monthlyTotalsSchema,
  type Transaction,
  type TransactionPage,
  transactionPageSchema,
  transactionSchema,
  type TransactionSummary,
  type TransactionSummaryQuery,
  transactionSummaryQuerySchema,
  transactionSummarySchema,
  type TransactionInputDto,
  transactionInputSchema,
} from '@kopilka/shared';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import {
  CSV_BOM,
  csvLine,
  TRANSACTION_CSV_HEADER,
  transactionCsvRows,
} from './csv.js';
import { TransactionsService } from './transactions.service.js';

/** The date of the file in the reader's own zone; ASCII, so the
 * Content-Disposition header needs no encoding. */
function fileName({ timeZone }: ExportTransactionsQuery): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `kopilka-transactions-${today}.csv`;
}

/** Written to the response only when the socket has room for it. */
async function write(res: Response, chunk: string): Promise<void> {
  if (!res.write(chunk)) await once(res, 'drain');
}

@ApiTags('transactions')
@ApiErrorResponses(401)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  // Before any ':id' route, or "export" would be read as an id.
  @Get('export')
  @ApiOperation({
    summary: 'The matching transactions as a CSV file',
    description:
      'The filters of the feed, without paging. Semicolons, a comma for the decimal mark and a byte order mark: what a Russian Excel opens by double-click, and what the import reads back. Streamed, so the size of the file does not decide the memory of the server.',
  })
  @ApiOkResponse({
    description: 'text/csv; charset=utf-8, as an attachment',
    content: { 'text/csv': { schema: { type: 'string' } } },
  })
  @ApiErrorResponses(400)
  async export(
    @CurrentUser() user: AuthUser,
    @Query({ schema: exportTransactionsQuerySchema })
    query: ExportTransactionsQuery,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName(query)}"`,
    );

    await write(res, CSV_BOM + csvLine(TRANSACTION_CSV_HEADER));
    for await (const batch of this.transactions.exportRows(user.id, query)) {
      await write(
        res,
        batch
          .flatMap((transaction) =>
            transactionCsvRows(transaction, query.timeZone),
          )
          .map(csvLine)
          .join(''),
      );
    }
    res.end();
  }

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

  @Get('by-category')
  @ApiOperation({
    summary: 'Totals per category over a period, largest first',
    description: 'Only categories with transactions in the period.',
  })
  @ApiOkResponse({ standardSchema: categoryTotalsSchema })
  @ApiErrorResponses(400)
  byCategory(
    @CurrentUser() user: AuthUser,
    @Query({ schema: categoryTotalsQuerySchema }) query: CategoryTotalsQuery,
  ): Promise<CategoryTotal[]> {
    return this.transactions.byCategory(user.id, query);
  }

  @Get('monthly')
  @ApiOperation({
    summary: 'Income and expense per month',
    description:
      'Every month from `from` to `to`, months without transactions as zeros. Months begin and end in `timeZone`. Transfers are not counted.',
  })
  @ApiOkResponse({ standardSchema: monthlyTotalsSchema })
  @ApiErrorResponses(400)
  monthly(
    @CurrentUser() user: AuthUser,
    @Query({ schema: monthlyTotalsQuerySchema }) query: MonthlyTotalsQuery,
  ): Promise<MonthlyTotal[]> {
    return this.transactions.monthly(user.id, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Record an income, an expense or a transfer',
    description:
      'Refused with INSUFFICIENT_FUNDS if an account that must not go negative would end up below zero.',
  })
  @ApiCreatedResponse({ standardSchema: transactionSchema })
  @ApiErrorResponses(400, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: transactionInputSchema }) dto: TransactionInputDto,
  ): Promise<Transaction> {
    return this.transactions.create(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Replace a transaction',
    description:
      'The whole transaction, as on create: it may change its type too.',
  })
  @ApiOkResponse({ standardSchema: transactionSchema })
  @ApiErrorResponses(400, 404, 409)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: transactionInputSchema }) dto: TransactionInputDto,
  ): Promise<Transaction> {
    return this.transactions.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a transaction',
    description:
      'Refused with INSUFFICIENT_FUNDS if removing an income would take an account that must not go negative below zero.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.transactions.remove(user.id, id);
  }
}
