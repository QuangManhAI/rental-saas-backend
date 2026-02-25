import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentSettingsDocument = HydratedDocument<PaymentSettings>;

export enum PaymentProvider {
  MOMO = 'MOMO',
  VNPAY = 'VNPAY',
}

/**
 * Encrypted credential stored as a sub-document.
 * All three fields are hex strings (AES-256-GCM output).
 */
export interface EncryptedCredential {
  iv: string;
  data: string;
  tag: string;
}

@Schema({ timestamps: true })
export class PaymentSettings {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ default: PaymentProvider.MOMO, enum: PaymentProvider })
  provider: PaymentProvider;

  // MoMo credentials — stored encrypted (EncryptedCredential JSON)
  @Prop({ trim: true })
  momoPartnerCode?: string;

  @Prop({ type: Object })
  momoAccessKey?: EncryptedCredential;

  @Prop({ type: Object })
  momoSecretKey?: EncryptedCredential;

  // VNPay credentials — stored encrypted (EncryptedCredential JSON)
  @Prop({ trim: true })
  vnpayTmnCode?: string;

  @Prop({ type: Object })
  vnpayHashSecret?: EncryptedCredential;

  @Prop({ default: 'sandbox', enum: ['sandbox', 'production'] })
  environment: 'sandbox' | 'production';

  @Prop({ default: false })
  isActive: boolean;
}

export const PaymentSettingsSchema = SchemaFactory.createForClass(PaymentSettings);
