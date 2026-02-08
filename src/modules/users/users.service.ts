import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './users.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserPayload } from '../../shared/types';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(
    dto: CreateUserDto,
    currentUser: UserPayload,
  ): Promise<UserDocument> {
    const existing = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .lean();
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      fullName: dto.fullName,
      phone: dto.phone,
      role: dto.role || Role.STAFF,
      ownerId: new Types.ObjectId(currentUser.ownerId),
      isActive: true,
    });

    // Remove password from response
    const result = user.toObject() as unknown as Record<string, unknown>;
    delete result.password;
    return result as unknown as UserDocument;
  }

  async findAll(currentUser: UserPayload): Promise<UserDocument[]> {
    return this.userModel
      .find({
        ownerId: new Types.ObjectId(currentUser.ownerId),
        _id: { $ne: new Types.ObjectId(currentUser.userId) },
      })
      .lean()
      .exec();
  }

  async findOne(id: string, currentUser: UserPayload): Promise<UserDocument> {
    const user = await this.userModel
      .findOne({
        _id: id,
        ownerId: new Types.ObjectId(currentUser.ownerId),
      })
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user as UserDocument;
  }

  async getProfile(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user as UserDocument;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser: UserPayload,
  ): Promise<UserDocument> {
    const updateData: Record<string, unknown> = { ...dto };

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 12);
    }

    const user = await this.userModel
      .findOneAndUpdate(
        { _id: id, ownerId: new Types.ObjectId(currentUser.ownerId) },
        updateData,
        { new: true },
      )
      .lean();

    if (!user) {
      throw new NotFoundException('User not found or access denied');
    }
    return user as UserDocument;
  }

  async remove(
    id: string,
    currentUser: UserPayload,
  ): Promise<{ message: string }> {
    if (id === currentUser.userId) {
      throw new ConflictException('Cannot delete your own account');
    }

    const result = await this.userModel.deleteOne({
      _id: id,
      ownerId: new Types.ObjectId(currentUser.ownerId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('User not found or access denied');
    }
    return { message: 'User deleted successfully' };
  }
}
