import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { MailModule } from '../mail/mail.module.js';
import { RecurringAlertsService } from './recurring-alerts.service.js';
import { RecurringController } from './recurring.controller.js';
import { RecurringRunner } from './recurring.runner.js';
import { RecurringService } from './recurring.service.js';

@Module({
  imports: [AccountsModule, MailModule],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringRunner, RecurringAlertsService],
})
export class RecurringModule {}
