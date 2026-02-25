import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Property, PropertyDocument } from './properties.schema';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UserPayload } from '../../shared/types';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PaginatedResponse, buildPaginatedResponse } from '../../common/dto/paginated-response.dto';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
  ) {}

  async create(
    dto: CreatePropertyDto,
    user: UserPayload,
  ): Promise<PropertyDocument> {
    return this.propertyModel.create({
      ...dto,
      ownerId: new Types.ObjectId(user.ownerId),
    });
  }

  async findAll(
    user: UserPayload,
    query: PaginationDto = {},
  ): Promise<PaginatedResponse<PropertyDocument>> {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      ownerId: new Types.ObjectId(user.ownerId),
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.propertyModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.propertyModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data as PropertyDocument[], total, page, limit);
  }

  async findOne(id: string, user: UserPayload): Promise<PropertyDocument> {
    const property = await this.propertyModel
      .findOne({
        _id: id,
        ownerId: new Types.ObjectId(user.ownerId),
      })
      .lean();

    if (!property) {
      throw new NotFoundException('Property not found or access denied');
    }
    return property as PropertyDocument;
  }

  async update(
    id: string,
    dto: UpdatePropertyDto,
    user: UserPayload,
  ): Promise<PropertyDocument> {
    const property = await this.propertyModel
      .findOneAndUpdate(
        { _id: id, ownerId: new Types.ObjectId(user.ownerId) },
        dto,
        { new: true },
      )
      .lean();

    if (!property) {
      throw new NotFoundException('Property not found or access denied');
    }
    return property as PropertyDocument;
  }

  async remove(
    id: string,
    user: UserPayload,
  ): Promise<{ message: string }> {
    const result = await this.propertyModel.deleteOne({
      _id: id,
      ownerId: new Types.ObjectId(user.ownerId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Property not found or access denied');
    }
    return { message: 'Property deleted successfully' };
  }
}
