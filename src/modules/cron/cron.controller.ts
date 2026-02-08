import { Controller, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { CronService } from './cron.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('cron')
@UseGuards(JwtAuthGuard)
export class CronController {
  constructor(private readonly cronService: CronService) {}

  /**
   * POST /api/cron/overdue-check
   * Manually trigger the overdue bill check (useful for testing).
   */
  @Post('overdue-check')
  @HttpCode(HttpStatus.OK)
  async triggerOverdueCheck() {
    return this.cronService.checkOverdueBills();
  }

  /**
   * POST /api/cron/contract-expiry-check
   * Manually trigger the contract expiry check.
   */
  @Post('contract-expiry-check')
  @HttpCode(HttpStatus.OK)
  async triggerContractExpiryCheck() {
    return this.cronService.checkExpiringContracts();
  }
}
