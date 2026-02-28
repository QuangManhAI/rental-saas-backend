import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { Subscription, SubscriptionSchema } from './subscription.schema';
import { UpgradeRequest, UpgradeRequestSchema } from './upgrade-request.schema';
import { Property, PropertySchema } from '../properties/properties.schema';
import { Room, RoomSchema } from '../rooms/rooms.schema';
import { User, UserSchema } from '../users/users.schema';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: UpgradeRequest.name, schema: UpgradeRequestSchema },
      { name: Property.name, schema: PropertySchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
    ]),
    PaymentSettingsModule,
  ],
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
