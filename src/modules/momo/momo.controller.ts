import {
    Controller,
    Post,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { MomoService } from './momo.service';
import { CreateMomoPaymentDto, MomoIpnDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';

/**
 * MoMo Payment Controller
 * 
 * Endpoints:
 * - POST /momo/create-payment (JWT protected) - Create payment for a bill
 * - POST /momo/ipn (public) - Webhook callback from MoMo
 */
@Controller('momo')
export class MomoController {
    constructor(private readonly momoService: MomoService) { }

    /**
     * Create a MoMo payment request
     * Returns payUrl for frontend to redirect user
     */
    @Post('create-payment')
    @UseGuards(JwtAuthGuard)
    async createPayment(
        @Body() dto: CreateMomoPaymentDto,
        @CurrentUser() user: UserPayload,
    ) {
        return this.momoService.createPayment(dto.billId, user);
    }

    /**
     * MoMo IPN (Instant Payment Notification) webhook
     * 
     * This endpoint is called by MoMo servers after payment
     * It must be publicly accessible (no JWT auth)
     * Always returns HTTP 200 if processed to acknowledge receipt
     */
    @Post('ipn')
    @HttpCode(HttpStatus.OK)
    async handleIpn(@Body() payload: MomoIpnDto) {
        return this.momoService.handleIpn(payload);
    }
}
