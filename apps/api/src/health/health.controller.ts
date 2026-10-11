import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import { DatabaseHealthIndicator } from './database.health.js';

// Probes come from the platform every few seconds, without credentials and
// often from a single IP: they must be neither authenticated nor throttled.
@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  /**
   * Liveness: is the process able to respond at all? Deliberately checks
   * no dependencies. If the database is down, restarting the app will not
   * bring it back, and a failing liveness probe makes the platform restart
   * the app in a loop.
   */
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  /**
   * Readiness: can it serve requests right now? While this fails, the
   * platform stops routing traffic here (and holds back a new deploy)
   * instead of sending users into errors.
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.database.check()]);
  }
}
