import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true, lowercase: true })
  email: string;

  @Prop({ trim: true })
  password?: string;

  @Prop({ default: false })
  isActivated: boolean;

  @Prop({ type: String, default: null })
  activationToken?: string | null;

  @Prop({ type: Date, default: null })
  activationTokenExpiresAt?: Date | null;

  /** True after first activation; cleared once the tenant changes their own password */
  @Prop({ default: false })
  mustChangePassword: boolean;

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

// Sparse unique index on email per owner (allows null/empty emails)
TenantSchema.index(
  { ownerId: 1, email: 1 },
  { unique: true, sparse: true, partialFilterExpression: { email: { $type: 'string', $ne: '' } } },
);

// Activation token lookup
TenantSchema.index({ activationToken: 1 }, { sparse: true });
