import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UpgradeRequestDocument = HydratedDocument<UpgradeRequest>;

export enum UpgradeRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum PaymentMethod {
  MOMO = 'momo',
  BANK_TRANSFER = 'bank_transfer',
}

export const PLAN_PRICES: Record<string, number> = {
  basic: 199000,
  pro: 499000,
};

@Schema({ timestamps: true })
export class UpgradeRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true })
  fromPlan: string;

  @Prop({ required: true })
  toPlan: string;

  @Prop({ required: true, min: 1, default: 1 })
  months: number;

  @Prop({ required: true, min: 0, default: 0 })
  amount: number;

  @Prop({ required: true, enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Prop({ required: true, enum: UpgradeRequestStatus, default: UpgradeRequestStatus.PENDING })
  status: UpgradeRequestStatus;

  @Prop({ trim: true })
  notes?: string;
}

export const UpgradeRequestSchema = SchemaFactory.createForClass(UpgradeRequest);
