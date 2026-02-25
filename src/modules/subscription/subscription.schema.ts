import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SubscriptionDocument = HydratedDocument<Subscription>;

export enum SubscriptionPlan {
  FREE = 'free',
  BASIC = 'basic',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIAL = 'trial',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export const PLAN_LIMITS: Record<SubscriptionPlan, {
  propertyLimit: number;
  roomLimit: number;
  staffLimit: number;
  features: string[];
}> = {
  [SubscriptionPlan.FREE]: {
    propertyLimit: 1,
    roomLimit: 10,
    staffLimit: 1,
    features: ['bills', 'payments', 'tenant-portal', 'pdf-export'],
  },
  [SubscriptionPlan.BASIC]: {
    propertyLimit: 5,
    roomLimit: 50,
    staffLimit: 2,
    features: ['bills', 'payments', 'tenant-portal', 'pdf-export', 'telegram', 'email', 'reports', 'vnpay', 'vietqr'],
  },
  [SubscriptionPlan.PRO]: {
    propertyLimit: -1, // unlimited
    roomLimit: -1,
    staffLimit: -1,
    features: ['bills', 'payments', 'tenant-portal', 'pdf-export', 'telegram', 'email', 'reports', 'vnpay', 'vietqr', 'api', 'priority-support'],
  },
};

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, enum: SubscriptionPlan, default: SubscriptionPlan.FREE })
  plan: SubscriptionPlan;

  @Prop({ required: true, enum: SubscriptionStatus, default: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @Prop()
  trialEndsAt?: Date;

  @Prop()
  currentPeriodStart: Date;

  @Prop()
  currentPeriodEnd?: Date;

  @Prop({ default: 10 })
  roomLimit: number;

  @Prop({ default: 1 })
  propertyLimit: number;

  @Prop({ default: 1 })
  staffLimit: number;

  @Prop({ type: [String], default: [] })
  features: string[];

  @Prop({ trim: true })
  notes?: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
