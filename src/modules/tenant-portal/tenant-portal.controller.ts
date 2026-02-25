import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { TenantJwtGuard } from '../../common/guards/tenant-jwt.guard';
import { TenantPortalService } from './tenant-portal.service';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('tenant-portal')
@UseGuards(TenantJwtGuard)
@SkipThrottle()
export class TenantPortalController {
  constructor(private readonly service: TenantPortalService) {}

  @Get('bills')
  async getBills(@Request() req: any) {
    return this.service.getBills(req.user);
  }

  @Get('bills/:id')
  async getBill(@Param('id', ParseObjectIdPipe) id: string, @Request() req: any) {
    return this.service.getBill(id, req.user);
  }

  @Get('payments')
  async getPayments(@Request() req: any) {
    return this.service.getPayments(req.user);
  }
}
