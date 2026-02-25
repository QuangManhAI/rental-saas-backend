import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../users/users.schema';
import { Property, PropertySchema } from '../properties/properties.schema';
import { Room, RoomSchema } from '../rooms/rooms.schema';
import { Bill, BillSchema } from '../bills/bills.schema';
import { Payment, PaymentSchema } from '../payments/payments.schema';
import { Subscription, SubscriptionSchema } from '../subscription/subscription.schema';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Property.name, schema: PropertySchema },
      { name: Room.name, schema: RoomSchema },
      { name: Bill.name, schema: BillSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    SubscriptionModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
