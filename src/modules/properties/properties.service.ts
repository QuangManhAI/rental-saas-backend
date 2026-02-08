import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Property, PropertyDocument } from './properties.schema';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UserPayload } from '../../shared/types';

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

  async findAll(user: UserPayload): Promise<PropertyDocument[]> {
    return this.propertyModel
      .find({ ownerId: new Types.ObjectId(user.ownerId) })
      .lean()
      .exec();
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
