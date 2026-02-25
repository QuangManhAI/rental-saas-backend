import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export enum NotificationType {
  NEW_BILL = 'NEW_BILL',
  BILL_DUE = 'BILL_DUE',
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  CONTRACT_EXPIRING = 'CONTRACT_EXPIRING',
  INFO = 'INFO',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, enum: NotificationType })
  type: NotificationType;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop()
  link?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ ownerId: 1, createdAt: -1 });
NotificationSchema.index({ ownerId: 1, isRead: 1 });
