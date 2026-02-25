import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantAuthController } from './tenant-auth.controller';
import { TenantAuthService } from './tenant-auth.service';
import { TenantToken, TenantTokenSchema } from './tenant-token.schema';
import { Tenant, TenantSchema } from '../tenants/tenants.schema';
import { Otp, OtpSchema } from '../auth/otp.schema';
import { TenantJwtStrategy } from '../../common/strategies/tenant-jwt.strategy';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: TenantToken.name, schema: TenantTokenSchema },
      { name: Tenant.name, schema: TenantSchema },
      { name: Otp.name, schema: OtpSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('tenantJwt.secret'),
        signOptions: { expiresIn: configService.get('tenantJwt.expiresIn') || '30d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [TenantAuthController],
  providers: [TenantAuthService, TenantJwtStrategy],
  exports: [TenantAuthService, TenantJwtStrategy, MongooseModule],
})
export class TenantAuthModule {}
