import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';

import { User, UserSchema } from '../users/users.schema';
import { Property, PropertySchema } from '../properties/properties.schema';
import { Room, RoomSchema } from '../rooms/rooms.schema';
import { Tenant, TenantSchema } from '../tenants/tenants.schema';
import { Customer, CustomerSchema } from '../customers/customer.schema';
import { Contract, ContractSchema } from '../contracts/contracts.schema';
import { Bill, BillSchema } from '../bills/bills.schema';
import { Payment, PaymentSchema } from '../payments/payments.schema';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../auth/auth.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Property.name, schema: PropertySchema },
      { name: Room.name, schema: RoomSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Bill.name, schema: BillSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  controllers: [SeedController],
  providers: [SeedService],
})
export class SeedModule {}
