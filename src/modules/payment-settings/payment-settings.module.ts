import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentSettings, PaymentSettingsSchema } from './payment-settings.schema';
import { PaymentSettingsService } from './payment-settings.service';
import { PaymentSettingsController } from './payment-settings.controller';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: PaymentSettings.name, schema: PaymentSettingsSchema },
        ]),
    ],
    controllers: [PaymentSettingsController],
    providers: [PaymentSettingsService],
    exports: [PaymentSettingsService],
})
export class PaymentSettingsModule { }
