import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { R2Service } from './r2.service';

import { Bill, BillSchema } from '../bills/bills.schema';
import { Contract, ContractSchema } from '../contracts/contracts.schema';
import { Room, RoomSchema } from '../rooms/rooms.schema';
import { Tenant, TenantSchema } from '../tenants/tenants.schema';
import { Payment, PaymentSchema } from '../payments/payments.schema';
import { Property, PropertySchema } from '../properties/properties.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Bill.name, schema: BillSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Property.name, schema: PropertySchema },
    ]),
  ],
  controllers: [ReportController],
  providers: [ReportService, R2Service],
  exports: [ReportService, R2Service],
})
export class ReportModule {}
