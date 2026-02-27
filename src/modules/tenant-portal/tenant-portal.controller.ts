import { Controller, Get, Post, Param, Body, UseGuards, Request, Req } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsMongoId } from 'class-validator';
import { TenantJwtGuard } from '../../common/guards/tenant-jwt.guard';
import { TenantPortalService } from './tenant-portal.service';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

class TenantCreatePaymentDto {
  @IsMongoId()
  billId: string;
}

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

  @Post('pay/momo')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createMomoPayment(@Body() dto: TenantCreatePaymentDto, @Request() req: any) {
    return this.service.createMomoPayment(dto.billId, req.user);
  }

  @Post('pay/vnpay')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createVnpayPayment(@Body() dto: TenantCreatePaymentDto, @Request() req: any, @Req() request: any) {
    const ipAddr =
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      '127.0.0.1';
    return this.service.createVnpayPayment(dto.billId, req.user, ipAddr);
  }

  @Get('payment-methods')
  async getPaymentMethods(@Request() req: any) {
    return this.service.getAvailablePaymentMethods(req.user);
  }
}
