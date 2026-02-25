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

// Partial unique index: enforce at DB level that only ONE active contract
// can exist per room. This prevents race-condition double-booking even when
// two requests pass the application-level check simultaneously.
ContractSchema.index(
  { roomId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ContractStatus.ACTIVE },
    name: 'unique_active_contract_per_room',
  },
);
