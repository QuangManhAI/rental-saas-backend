import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RoomStatus } from './enums/room-status.enum';

export type RoomDocument = HydratedDocument<Room>;

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  price: number;

  @Prop()
  area: number;

  @Prop({ default: RoomStatus.AVAILABLE, enum: RoomStatus })
  status: RoomStatus;

  @Prop({ trim: true })
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'Property', required: true, index: true })
  propertyId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ propertyId: 1, status: 1 });
