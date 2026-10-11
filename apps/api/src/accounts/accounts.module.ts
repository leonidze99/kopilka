import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
  // Transactions lock accounts and check their balances.
  exports: [AccountsService],
})
export class AccountsModule {}
