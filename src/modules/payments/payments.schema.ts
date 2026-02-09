import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { PaymentMethod } from './enums/payment-method.enum';
import { PaymentStatus } from './enums/payment-status.enum';

export type PaymentDocument = HydratedDocument<Payment>;

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

  // Transaction tracking fields
  @Prop({ trim: true, index: true })
  transactionId?: string;

  @Prop({ default: PaymentStatus.SUCCESS, enum: PaymentStatus })
  status: PaymentStatus;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
