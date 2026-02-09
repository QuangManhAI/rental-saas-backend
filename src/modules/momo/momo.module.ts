import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';

import { MomoService } from './momo.service';
import { MomoController } from './momo.controller';

import { Bill, BillSchema } from '../bills/bills.schema';
import { Payment, PaymentSchema } from '../payments/payments.schema';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';

/**
 * MoMo Payment Module
 * 
 * Provides multi-tenant MoMo payment integration:
 * - Create payment requests with owner-specific credentials
 * - Handle IPN callbacks with dynamic owner resolution
 */
@Module({
    imports: [
        ConfigModule,
        MongooseModule.forFeature([
            { name: Bill.name, schema: BillSchema },
            { name: Payment.name, schema: PaymentSchema },
        ]),
        PaymentSettingsModule,
    ],
    controllers: [MomoController],
    providers: [MomoService],
    exports: [MomoService],
})
export class MomoModule { }
