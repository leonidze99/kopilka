import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';
import { BaseCurrencyController } from './base-currency.controller.js';
import { BaseCurrencyService } from './base-currency.service.js';

@Module({
  controllers: [AccountsController, BaseCurrencyController],
  providers: [AccountsService, BaseCurrencyService],
  // Transactions lock accounts and check their balances.
  exports: [AccountsService],
})
export class AccountsModule {}
