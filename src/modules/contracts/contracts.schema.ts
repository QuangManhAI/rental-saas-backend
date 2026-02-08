import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ContractStatus } from './enums/contract-status.enum';

export type ContractDocument = HydratedDocument<Contract>;

@Schema({ timestamps: true })
export class Contract {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true })
  roomId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: 0 })
  deposit: number;

  @Prop({ required: true })
  rentPrice: number;

  @Prop({ default: ContractStatus.ACTIVE, enum: ContractStatus })
  status: ContractStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;
}

export const ContractSchema = SchemaFactory.createForClass(Contract);

ContractSchema.index({ roomId: 1, status: 1 });
ContractSchema.index({ ownerId: 1, status: 1 });
