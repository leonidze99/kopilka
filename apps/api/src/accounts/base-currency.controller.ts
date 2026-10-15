import { Body, Controller, Put } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type BaseCurrencySettingsDto,
  baseCurrencySettingsSchema,
  type User,
  userSchema,
} from '@kopilka/shared';
import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ApiErrorResponses } from '../common/openapi/api-error-responses.decorator.js';
import { BaseCurrencyService } from './base-currency.service.js';

// Under /auth with the other settings of the user; here because changing
// it converts money, which is this module's business.
@ApiTags('auth')
@Controller('auth')
export class BaseCurrencyController {
  constructor(private readonly baseCurrency: BaseCurrencyService) {}

  @Put('base-currency')
  @ApiOperation({
    summary: 'Change the currency totals and budgets are counted in',
    description:
      'Converts the base amount of every transaction at the rate of its day, and the limits of budgets and tag budgets at today’s rate. Accounts keep their currencies. EXCHANGE_RATE_UNAVAILABLE if a Bank of Russia rate is missing; nothing changes then.',
  })
  @ApiOkResponse({ standardSchema: userSchema })
  @ApiErrorResponses(400, 401, 409)
  set(
    @CurrentUser() user: AuthUser,
    @Body({ schema: baseCurrencySettingsSchema }) dto: BaseCurrencySettingsDto,
  ): Promise<User> {
    return this.baseCurrency.set(user.id, dto);
  }
}
