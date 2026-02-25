import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './notifications.schema';
import { UserPayload } from '../../shared/types';

export interface CreateNotificationDto {
  ownerId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notifModel: Model<NotificationDocument>,
  ) {}

  async create(dto: CreateNotificationDto): Promise<NotificationDocument> {
    return this.notifModel.create({
      ...dto,
      ownerId: new Types.ObjectId(dto.ownerId),
    });
  }

  async findByOwner(
    user: UserPayload,
    limit = 20,
  ): Promise<{ data: NotificationDocument[]; unreadCount: number }> {
    const ownerId = new Types.ObjectId(user.ownerId);
    const [data, unreadCount] = await Promise.all([
      this.notifModel
        .find({ ownerId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()
        .exec(),
      this.notifModel.countDocuments({ ownerId, isRead: false }),
    ]);
    return { data: data as NotificationDocument[], unreadCount };
  }

  async markRead(
    id: string,
    user: UserPayload,
  ): Promise<NotificationDocument | null> {
    return this.notifModel
      .findOneAndUpdate(
        { _id: id, ownerId: new Types.ObjectId(user.ownerId) },
        { isRead: true },
        { new: true },
      )
      .lean() as Promise<NotificationDocument | null>;
  }

  async markAllRead(user: UserPayload): Promise<{ modifiedCount: number }> {
    const result = await this.notifModel.updateMany(
      { ownerId: new Types.ObjectId(user.ownerId), isRead: false },
      { isRead: true },
    );
    return { modifiedCount: result.modifiedCount };
  }

  async deleteOld(daysOld = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);
    const result = await this.notifModel.deleteMany({
      createdAt: { $lt: cutoff },
      isRead: true,
    });
    return result.deletedCount;
  }
}
