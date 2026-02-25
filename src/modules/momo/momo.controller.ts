import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MomoService } from './momo.service';
import { CreateMomoPaymentDto, MomoIpnDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';

@Controller('momo')
export class MomoController {
  constructor(private readonly momoService: MomoService) {}

  @Post('create-payment')
  @UseGuards(JwtAuthGuard)
  // 20 payment link creations per minute per owner is generous
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async createPayment(
    @Body() dto: CreateMomoPaymentDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.momoService.createPayment(dto.billId, user);
  }

  /**
   * MoMo IPN webhook — must be publicly accessible, called by MoMo servers.
   * Rate limited to 30/min to allow MoMo retries while preventing flood.
   * Always returns HTTP 200 on success to acknowledge receipt.
   */
  @Post('ipn')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async handleIpn(@Body() payload: MomoIpnDto) {
    return this.momoService.handleIpn(payload);
  }
}
