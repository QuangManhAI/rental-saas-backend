import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsMongoId } from 'class-validator';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { VnpayService, VnpayIpnQuery } from './vnpay.service';

class CreateVnpayPaymentDto {
  @IsMongoId()
  billId: string;
}

@Controller('vnpay')
export class VnpayController {
  constructor(private readonly vnpayService: VnpayService) {}

  /**
   * POST /vnpay/create-payment
   * Owner/tenant creates a VNPay payment URL for a bill.
   */
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('create-payment')
  async createPayment(
    @Body() dto: CreateVnpayPaymentDto,
    @Request() req: any,
    @Req() request: any,
  ) {
    const ipAddr =
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      '127.0.0.1';

    return this.vnpayService.createPayment(dto.billId, req.user, ipAddr);
  }

  /**
   * GET /vnpay/ipn
   * Public — VNPay server-to-server callback.
   * Must respond within 5s with JSON {RspCode, Message}.
   */
  @SkipThrottle()
  @Get('ipn')
  @HttpCode(HttpStatus.OK)
  async handleIpn(@Query() query: VnpayIpnQuery) {
    return this.vnpayService.processIpn(query);
  }

  /**
   * GET /vnpay/return
   * VNPay redirects user here after payment.
   * Returns result JSON for frontend to display.
   */
  @SkipThrottle()
  @Get('return')
  async handleReturn(@Query() query: VnpayIpnQuery) {
    return this.vnpayService.validateReturn(query);
  }
}
