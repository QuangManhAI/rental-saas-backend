import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BillStatus } from './enums/bill-status.enum';

export type BillDocument = HydratedDocument<Bill>;

@Schema({ timestamps: true })
export class Bill {
  @Prop({ type: Types.ObjectId, ref: 'Contract', required: true, index: true })
  contractId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 12 })
  month: number;

  @Prop({ required: true })
  year: number;

  // Electricity
  @Prop({ required: true })
  electricOldIndex: number;

  @Prop({ required: true })
  electricNewIndex: number;

  @Prop({ required: true })
  electricRate: number;

  @Prop({ required: true })
  electricCost: number;

  // Water
  @Prop({ required: true })
  waterOldIndex: number;

  @Prop({ required: true })
  waterNewIndex: number;

  @Prop({ required: true })
  waterRate: number;

  @Prop({ required: true })
  waterCost: number;

  // Prices
  @Prop({ required: true })
  roomPrice: number;

  @Prop({ default: 0 })
  otherFee: number;

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ default: 0 })
  paidAmount: number;

  @Prop({ default: BillStatus.UNPAID, enum: BillStatus })
  status: BillStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;
}

export const BillSchema = SchemaFactory.createForClass(Bill);

BillSchema.index({ contractId: 1, month: 1, year: 1 }, { unique: true });
BillSchema.index({ ownerId: 1, status: 1 });
