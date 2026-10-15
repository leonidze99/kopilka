import { Global, Module } from '@nestjs/common';
import { CbrClient } from './cbr.client.js';
import { RatesService } from './rates.service.js';

// Global: every module that writes or sums money needs the rates.
@Global()
@Module({
  providers: [CbrClient, RatesService],
  exports: [RatesService],
})
export class RatesModule {}
