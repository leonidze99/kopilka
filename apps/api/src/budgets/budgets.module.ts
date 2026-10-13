import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { BudgetAlertsService } from './budget-alerts.service.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [MailModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetAlertsService],
})
export class BudgetsModule {}
