import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';
import {
  softDeletePlugin,
  SoftDeleteFields,
} from '../../common/plugins/soft-delete.plugin';

export type PaymentDocument = HydratedDocument<Payment> & SoftDeleteFields;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Bill', required: true, index: true })
  billId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ default: PaymentMethod.CASH, enum: PaymentMethod })
  method: PaymentMethod;

  @Prop({ trim: true })
  note: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  // Gateway transaction ID (MoMo transId, VNPay transactionNo, etc.)
  // Sparse unique index: allows multiple null values but prevents duplicate IDs.
  // This is the primary idempotency guard for payment gateway IPN callbacks.
  @Prop({ trim: true })
  transactionId?: string;

  @Prop({ default: PaymentStatus.SUCCESS, enum: PaymentStatus })
  status: PaymentStatus;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);

PaymentSchema.plugin(softDeletePlugin);

// Unique sparse index on transactionId — prevents duplicate payment records
// for the same gateway transaction (MoMo IPN retry protection).
PaymentSchema.index({ transactionId: 1 }, { unique: true, sparse: true });
