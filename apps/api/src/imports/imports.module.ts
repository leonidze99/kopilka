import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ImportWorker } from './import.worker.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [ImportsController],
  providers: [ImportsService, ImportWorker],
})
export class ImportsModule {}
