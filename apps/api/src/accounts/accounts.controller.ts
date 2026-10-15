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
  type Account,
  type AccountList,
  accountListSchema,
  accountSchema,
  type ArchiveAccountResult,
  archiveAccountResultSchema,
  type CreateAccountDto,
  createAccountSchema,
  type UpdateAccountDto,
  updateAccountSchema,
} from '@kopilka/shared';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('accounts')
@ApiErrorResponses(401)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @ApiOperation({
    summary: 'Accounts of the user with their balances, oldest first',
  })
  @ApiOkResponse({ standardSchema: accountListSchema })
  list(@CurrentUser() user: AuthUser): Promise<AccountList> {
    return this.accounts.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create an account' })
  @ApiCreatedResponse({ standardSchema: accountSchema })
  @ApiErrorResponses(400, 409)
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createAccountSchema }) dto: CreateAccountDto,
  ): Promise<Account> {
    return this.accounts.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change an account',
    description:
      'Refused with INSUFFICIENT_FUNDS if an account that must not go negative would end up below zero.',
  })
  @ApiOkResponse({ standardSchema: accountSchema })
  @ApiErrorResponses(400, 404, 409)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateAccountSchema }) dto: UpdateAccountDto,
  ): Promise<Account> {
    return this.accounts.update(user.id, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive an account',
    description:
      'Only with a zero balance (ACCOUNT_NOT_EMPTY otherwise). Its recurring rules stop; its transactions stay and keep counting. No new transactions, rules, goals or imports go onto it until it is back.',
  })
  @ApiOkResponse({ standardSchema: archiveAccountResultSchema })
  @ApiErrorResponses(404, 409)
  archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ArchiveAccountResult> {
    return this.accounts.archive(user.id, id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bring an account back from the archive',
    description: 'Its stopped recurring rules stay stopped.',
  })
  @ApiOkResponse({ standardSchema: accountSchema })
  @ApiErrorResponses(404)
  unarchive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Account> {
    return this.accounts.unarchive(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete an account',
    description: 'Refused with ACCOUNT_IN_USE while transactions use it.',
  })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.accounts.remove(user.id, id);
  }
}
