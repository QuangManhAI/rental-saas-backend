import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true, lowercase: true })
  email: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ required: true, trim: true })
  identityCard: string;

  @Prop({ trim: true })
  address: string;

  @Prop()
  dob: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ trim: true })
  telegramChatId?: string;

  @Prop()
  telegramLinkedAt?: Date;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);

// Unique identity card per owner
TenantSchema.index({ ownerId: 1, identityCard: 1 }, { unique: true });
