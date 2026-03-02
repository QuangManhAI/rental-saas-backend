import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Tenant, TenantDocument } from './tenants.schema';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UserPayload } from '../../shared/types';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResponse, buildPaginatedResponse } from '../../common/dto/paginated-response.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private readonly frontendUrl: string;

  constructor(
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = configService.get<string>('frontendUrl') || 'http://localhost:3000';
  }

  async create(
    dto: CreateTenantDto,
    user: UserPayload,
  ): Promise<TenantDocument> {
    const activationToken = randomBytes(32).toString('hex');
    const activationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    this.logger.log(`Creating tenant: ${dto.fullName}, email: ${dto.email || 'N/A'}, activationToken generated`);

    const tenant = await this.tenantModel.create({
      ...dto,
      ownerId: new Types.ObjectId(user.ownerId),
      isActivated: false,
      activationToken,
      activationTokenExpiresAt,
    });

    // No activation email here — email will be sent when contract is created.
    // Owner can manually resend activation via resendActivation() if needed.

    return tenant;
  }

  /**
   * Resend activation email for a tenant (called by owner).
   */
  async resendActivation(tenantId: string, user: UserPayload): Promise<{ message: string }> {
    const tenant = await this.tenantModel.findOne({
      _id: tenantId,
      ownerId: new Types.ObjectId(user.ownerId),
    });

    if (!tenant) throw new NotFoundException('Tenant not found or access denied');
    if (tenant.isActivated) return { message: 'Tài khoản đã được kích hoạt' };
    if (!tenant.email) throw new NotFoundException('Khách thuê chưa có email');

    const activationToken = randomBytes(32).toString('hex');
    tenant.activationToken = activationToken;
    tenant.activationTokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tenant.save();

    const activationLink = `${this.frontendUrl}/tenant/activate?token=${activationToken}`;
    await this.mailService.sendTenantActivation(tenant.email, {
      tenantName: tenant.fullName,
      activationLink,
      expiresIn: '24 giờ',
    });

    return { message: 'Đã gửi lại email kích hoạt' };
  }

  async findAll(
    user: UserPayload,
    query: PaginationDto = {},
  ): Promise<PaginatedResponse<TenantDocument>> {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      ownerId: new Types.ObjectId(user.ownerId),
    };

    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { identityCard: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.tenantModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.tenantModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data as TenantDocument[], total, page, limit);
  }

  async findOne(id: string, user: UserPayload): Promise<TenantDocument> {
    const tenant = await this.tenantModel
      .findOne({
        _id: id,
        ownerId: new Types.ObjectId(user.ownerId),
      })
      .lean();

    if (!tenant) {
      throw new NotFoundException('Tenant not found or access denied');
    }
    return tenant as TenantDocument;
  }

  async update(
    id: string,
    dto: UpdateTenantDto,
    user: UserPayload,
  ): Promise<TenantDocument> {
    const tenant = await this.tenantModel
      .findOneAndUpdate(
        { _id: id, ownerId: new Types.ObjectId(user.ownerId) },
        dto,
        { new: true },
      )
      .lean();

    if (!tenant) {
      throw new NotFoundException('Tenant not found or access denied');
    }
    return tenant as TenantDocument;
  }

  async remove(
    id: string,
    user: UserPayload,
  ): Promise<{ message: string }> {
    const result = await this.tenantModel.deleteOne({
      _id: id,
      ownerId: new Types.ObjectId(user.ownerId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Tenant not found or access denied');
    }
    return { message: 'Tenant deleted successfully' };
  }
}
