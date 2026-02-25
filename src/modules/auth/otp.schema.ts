import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type OtpDocument = HydratedDocument<Otp>;

export enum OtpType {
  REGISTER = 'register',
  CHANGE_PASSWORD = 'change-password',
  FORGOT_PASSWORD = 'forgot-password',
  TENANT_FORGOT_PASSWORD = 'tenant-forgot-password',
}

@Schema({ timestamps: true })
export class Otp {
  @Prop({ required: true, index: true })
  email: string;

  @Prop({ required: true })
  code: string;

  @Prop({ required: true, enum: OtpType })
  type: OtpType;

  @Prop({ type: MongooseSchema.Types.Mixed })
  payload: Record<string, any>;

  @Prop({ required: true, index: true, expires: 0 })
  expiresAt: Date;

  @Prop({ default: 0 })
  attempts: number;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);
