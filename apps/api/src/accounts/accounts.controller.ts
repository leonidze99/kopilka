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
