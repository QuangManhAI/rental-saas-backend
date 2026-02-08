import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tenant, TenantDocument } from './tenants.schema';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UserPayload } from '../../shared/types';

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
  ) {}

  async create(
    dto: CreateTenantDto,
    user: UserPayload,
  ): Promise<TenantDocument> {
    // Unique compound index (ownerId + identityCard) will throw on duplicate
    return this.tenantModel.create({
      ...dto,
      ownerId: new Types.ObjectId(user.ownerId),
    });
  }

  async findAll(user: UserPayload): Promise<TenantDocument[]> {
    return this.tenantModel
      .find({ ownerId: new Types.ObjectId(user.ownerId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
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
