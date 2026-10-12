import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { RecurringController } from './recurring.controller.js';
import { RecurringRunner } from './recurring.runner.js';
import { RecurringService } from './recurring.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringRunner],
})
export class RecurringModule {}
