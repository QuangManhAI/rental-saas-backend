import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true })
export class AuditLog {
  /** CREATE | UPDATE | DELETE | RESTORE */
  @Prop({ required: true, trim: true })
  action: string;

  /** Bill | Payment | Contract | … */
  @Prop({ required: true, trim: true })
  entity: string;

  @Prop({ type: Types.ObjectId })
  entityId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  ownerId: Types.ObjectId;

  /** Snapshot of the response body for mutation endpoints */
  @Prop({ type: Object })
  changes?: Record<string, unknown>;

  @Prop({ trim: true })
  ipAddress?: string;

  @Prop({ trim: true })
  userAgent?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

// Primary query pattern: owner timeline
AuditLogSchema.index({ ownerId: 1, createdAt: -1 });
// Secondary: lookup by entity
AuditLogSchema.index({ entity: 1, entityId: 1 });
