import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomDocument } from './rooms.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { UserPayload } from '../../shared/types';

@Injectable()
export class RoomsService {
  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
  ) {}

  async create(dto: CreateRoomDto, user: UserPayload): Promise<RoomDocument> {
    const property = await this.propertyModel
      .findOne({
        _id: dto.propertyId,
        ownerId: new Types.ObjectId(user.ownerId),
      })
      .lean();

    if (!property) {
      throw new BadRequestException('Property not found or access denied');
    }

    return this.roomModel.create({
      name: dto.name,
      price: dto.price,
      area: dto.area,
      description: dto.description,
      status: dto.status,
      propertyId: new Types.ObjectId(dto.propertyId),
      ownerId: new Types.ObjectId(user.ownerId),
    });
  }

  async findAll(
    user: UserPayload,
    propertyId?: string,
  ): Promise<RoomDocument[]> {
    const filter: Record<string, unknown> = {
      ownerId: new Types.ObjectId(user.ownerId),
    };

    if (propertyId) {
      filter.propertyId = new Types.ObjectId(propertyId);
    }

    return this.roomModel
      .find(filter)
      .populate('propertyId', 'name address')
      .lean()
      .exec();
  }

  async findOne(id: string, user: UserPayload): Promise<RoomDocument> {
    const room = await this.roomModel
      .findOne({
        _id: id,
        ownerId: new Types.ObjectId(user.ownerId),
      })
      .populate('propertyId', 'name address')
      .lean();

    if (!room) {
      throw new NotFoundException('Room not found or access denied');
    }
    return room as RoomDocument;
  }

  async update(
    id: string,
    dto: UpdateRoomDto,
    user: UserPayload,
  ): Promise<RoomDocument> {
    if (dto.propertyId) {
      const property = await this.propertyModel
        .findOne({
          _id: dto.propertyId,
          ownerId: new Types.ObjectId(user.ownerId),
        })
        .lean();

      if (!property) {
        throw new BadRequestException('Target property not found or access denied');
      }
    }

    const updateData: Record<string, unknown> = { ...dto };
    if (dto.propertyId) {
      updateData.propertyId = new Types.ObjectId(dto.propertyId);
    }

    const room = await this.roomModel
      .findOneAndUpdate(
        { _id: id, ownerId: new Types.ObjectId(user.ownerId) },
        updateData,
        { new: true },
      )
      .lean();

    if (!room) {
      throw new NotFoundException('Room not found or access denied');
    }
    return room as RoomDocument;
  }

  async remove(
    id: string,
    user: UserPayload,
  ): Promise<{ message: string }> {
    const result = await this.roomModel.deleteOne({
      _id: id,
      ownerId: new Types.ObjectId(user.ownerId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Room not found or access denied');
    }
    return { message: 'Room deleted successfully' };
  }
}
