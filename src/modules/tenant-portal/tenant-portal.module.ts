import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { TenantPortalController } from './tenant-portal.controller';
import { TenantPortalService } from './tenant-portal.service';
import { Bill, BillSchema } from '../bills/bills.schema';
import { Contract, ContractSchema } from '../contracts/contracts.schema';
import { Payment, PaymentSchema } from '../payments/payments.schema';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: Bill.name, schema: BillSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    TenantAuthModule, // Provides TenantJwtStrategy
  ],
  controllers: [TenantPortalController],
  providers: [TenantPortalService],
})
export class TenantPortalModule {}
