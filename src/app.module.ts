import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { CacheModule } from '@nestjs/cache-manager';
import { CryptoModule } from './common/crypto/crypto.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { LoggingMiddleware } from './common/middleware/logging.middleware';

import configuration from './config/configuration';
import { mongooseAsyncConfig } from './database/mongoose.config';
import { winstonConfig } from './config/winston.config';

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
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TenantAuthModule } from './modules/tenant-auth/tenant-auth.module';
import { TenantPortalModule } from './modules/tenant-portal/tenant-portal.module';
import { VnpayModule } from './modules/vnpay/vnpay.module';
import { BankAccountsModule } from './modules/bank-accounts/bank-accounts.module';
import { InvoiceModule } from './modules/invoice/invoice.module';
import { MailModule } from './modules/mail/mail.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';

@Module({
  imports: [
    // Global config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      cache: true,
    }),

    // Structured logging (Winston — replaces NestJS default logger)
    WinstonModule.forRoot(winstonConfig),

    // Redis cache (falls back to in-memory when REDIS_URL is not set)
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const redisUrl = configService.get<string>('redis.url');
        if (redisUrl) {
          const { redisStore } = await import('cache-manager-redis-yet');
          const store = await redisStore({ url: redisUrl, ttl: 5 * 60 * 1000 });
          return { store };
        }
        // No Redis configured — use in-memory cache (development)
        return { ttl: 5 * 60 * 1000 };
      },
    }),

    // Global rate limiting: 100 requests/minute per IP (default)
    // Override per-route with @Throttle({ default: { limit: N, ttl: Ms } })
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // 1 minute in ms
        limit: 100,
      },
    ]),

    // MongoDB
    MongooseModule.forRootAsync(mongooseAsyncConfig),

    // Global crypto (AES-256-GCM encryption for credentials at rest)
    CryptoModule,

    // Global audit log (AuditInterceptor available project-wide)
    AuditModule,

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
    AnalyticsModule,
    HealthModule,
    NotificationsModule,
    TenantAuthModule,
    TenantPortalModule,
    VnpayModule,
    BankAccountsModule,
    InvoiceModule,
    MailModule,
    OnboardingModule,
    SubscriptionModule,
    AdminModule,
    AiAgentModule,
  ],
  providers: [
    // Apply ThrottlerGuard globally to all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, LoggingMiddleware)
      .forRoutes('*');
  }
}
