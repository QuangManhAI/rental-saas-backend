import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { InvoiceController } from './invoice.controller';
import { InvoiceService } from './invoice.service';
import { Bill, BillSchema } from '../bills/bills.schema';
import { Contract, ContractSchema } from '../contracts/contracts.schema';
import { Tenant, TenantSchema } from '../tenants/tenants.schema';
import { Room, RoomSchema } from '../rooms/rooms.schema';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: Bill.name, schema: BillSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
    BankAccountsModule,
    TenantAuthModule,
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService],
})
export class InvoiceModule {}
