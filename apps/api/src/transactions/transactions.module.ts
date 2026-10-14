import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [AccountsModule, TagsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
