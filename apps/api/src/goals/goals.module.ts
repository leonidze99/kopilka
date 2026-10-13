import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { GoalsController } from './goals.controller.js';
import { GoalsService } from './goals.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
