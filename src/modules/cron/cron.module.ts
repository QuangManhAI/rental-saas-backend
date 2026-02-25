import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { CronService } from './cron.service';
import { CronController } from './cron.controller';

import { Bill, BillSchema } from '../bills/bills.schema';
import { Contract, ContractSchema } from '../contracts/contracts.schema';
import { Room, RoomSchema } from '../rooms/rooms.schema';
import { Tenant, TenantSchema } from '../tenants/tenants.schema';
import { User, UserSchema } from '../users/users.schema';
import { MomoModule } from '../momo/momo.module';
import { TelegramModule } from '../telegram/telegram.module';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Bill.name, schema: BillSchema },
      { name: Contract.name, schema: ContractSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: User.name, schema: UserSchema },
    ]),
    MomoModule,
    TelegramModule,
    PaymentSettingsModule,
    SubscriptionModule,
  ],
  controllers: [CronController],
  providers: [CronService],
})
export class CronModule { }
