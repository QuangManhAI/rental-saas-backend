import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VnpayController } from './vnpay.controller';
import { VnpayService } from './vnpay.service';
import { Bill, BillSchema } from '../bills/bills.schema';
import { Payment, PaymentSchema } from '../payments/payments.schema';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Bill.name, schema: BillSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    PaymentSettingsModule,
  ],
  controllers: [VnpayController],
  providers: [VnpayService],
  exports: [VnpayService],
})
export class VnpayModule {}
