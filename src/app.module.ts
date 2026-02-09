import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import configuration from './config/configuration';
import { mongooseAsyncConfig } from './database/mongoose.config';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RoomsModule } from './modules/rooms/rooms.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { BillsModule } from './modules/bills/bills.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PaymentSettingsModule } from './modules/payment-settings/payment-settings.module';
import { MomoModule } from './modules/momo/momo.module';
import { SeedModule } from './modules/seed/seed.module';
import { ReportModule } from './modules/report/report.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { CronModule } from './modules/cron/cron.module';

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    // MongoDB
    MongooseModule.forRootAsync(mongooseAsyncConfig),

    // Feature modules
    AuthModule,
    UsersModule,
    PropertiesModule,
    RoomsModule,
    TenantsModule,
    ContractsModule,
    BillsModule,
    PaymentsModule,
    PaymentSettingsModule,
    MomoModule,

    // Support modules
    SeedModule,
    ReportModule,
    TelegramModule,
    CronModule,
  ],
})
export class AppModule { }

