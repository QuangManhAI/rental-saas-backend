import { Controller, Get, Version, VERSION_NEUTRAL } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongooseHealth: MongooseHealthIndicator,
  ) {}

  /**
   * Liveness probe — returns 200 as long as the process is alive.
   * Used by Docker healthcheck and load balancers.
   * VERSION_NEUTRAL: accessible at /api/healthz regardless of versioning.
   */
  @Get('healthz')
  @Version(VERSION_NEUTRAL)
  liveness() {
    return { status: 'ok' };
  }

  /**
   * Readiness probe — checks downstream dependencies (MongoDB).
   * Returns 503 if any dependency is unavailable.
   * VERSION_NEUTRAL: accessible at /api/readyz regardless of versioning.
   */
  @Get('readyz')
  @Version(VERSION_NEUTRAL)
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.mongooseHealth.pingCheck('mongodb'),
    ]);
  }
}
