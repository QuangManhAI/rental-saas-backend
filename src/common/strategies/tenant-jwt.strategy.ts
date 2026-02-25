import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant, TenantDocument } from '../../modules/tenants/tenants.schema';
import { TenantPayload } from '../../modules/tenant-auth/tenant-auth.service';

interface TenantJwtPayload {
  tenantId: string;
  ownerId: string;
  role: 'tenant';
}

@Injectable()
export class TenantJwtStrategy extends PassportStrategy(Strategy, 'jwt-tenant') {
  constructor(
    configService: ConfigService,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('tenantJwt.secret'),
    });
  }

  async validate(payload: TenantJwtPayload): Promise<TenantPayload> {
    if (payload.role !== 'tenant') {
      throw new UnauthorizedException('Not a tenant token');
    }

    const tenant = await this.tenantModel.findById(payload.tenantId).lean().exec();
    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }

    return {
      tenantId: payload.tenantId,
      ownerId: payload.ownerId,
      role: 'tenant',
    };
  }
}
