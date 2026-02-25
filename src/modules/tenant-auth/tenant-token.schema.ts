import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TenantTokenDocument = HydratedDocument<TenantToken>;

@Schema({ timestamps: true })
export class TenantToken {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Date, default: null })
  usedAt: Date | null;
}

export const TenantTokenSchema = SchemaFactory.createForClass(TenantToken);

// Auto-delete expired tokens via MongoDB TTL index
TenantTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
