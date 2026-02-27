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
        if (!settings) return { configured: false };

        // Sanitize: never expose encrypted credential objects to the frontend.
        // Return a boolean flag so FE knows credentials are set, plus the plain-text fields.
        const plain = settings.toObject ? settings.toObject() : { ...settings };
        return {
            ...plain,
            momoAccessKey: plain.momoAccessKey ? '••••••••' : undefined,
            momoSecretKey: plain.momoSecretKey ? '••••••••' : undefined,
            vnpayHashSecret: plain.vnpayHashSecret ? '••••••••' : undefined,
        };
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
        const result = await this.paymentSettingsService.upsert(user.ownerId, dto);
        const plain = result.toObject ? result.toObject() : { ...result };
        return {
            ...plain,
            momoAccessKey: plain.momoAccessKey ? '••••••••' : undefined,
            momoSecretKey: plain.momoSecretKey ? '••••••••' : undefined,
            vnpayHashSecret: plain.vnpayHashSecret ? '••••••••' : undefined,
        };
    }
}
