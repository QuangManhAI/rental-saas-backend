import {
    Controller,
    Get,
    Put,
    Body,
    UseGuards,
} from '@nestjs/common';
import { PaymentSettingsService } from './payment-settings.service';
import { UpsertPaymentSettingsDto } from './dto/upsert-payment-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';

@Controller('payment-settings')
@UseGuards(JwtAuthGuard)
export class PaymentSettingsController {
    constructor(private readonly paymentSettingsService: PaymentSettingsService) { }

    /**
     * GET /api/payment-settings
     * Get current owner's payment settings
     */
    @Get()
    async get(@CurrentUser() user: UserPayload) {
        const settings = await this.paymentSettingsService.getByOwnerId(user.ownerId);
        return settings || { configured: false };
    }

    /**
     * PUT /api/payment-settings
     * Upsert current owner's payment settings
     */
    @Put()
    async upsert(
        @Body() dto: UpsertPaymentSettingsDto,
        @CurrentUser() user: UserPayload,
    ) {
        return this.paymentSettingsService.upsert(user.ownerId, dto);
    }
}
