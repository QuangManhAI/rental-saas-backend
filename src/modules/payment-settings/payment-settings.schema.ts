import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentSettingsDocument = HydratedDocument<PaymentSettings>;

export enum PaymentProvider {
    MOMO = 'MOMO',
    VNPAY = 'VNPAY',
}

@Schema({ timestamps: true })
export class PaymentSettings {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
    ownerId: Types.ObjectId;

    @Prop({ default: PaymentProvider.MOMO, enum: PaymentProvider })
    provider: PaymentProvider;

    @Prop({ trim: true })
    momoPartnerCode?: string;

    @Prop({ trim: true })
    momoAccessKey?: string;

    @Prop({ trim: true })
    momoSecretKey?: string;

    @Prop({ trim: true })
    vnpayTmnCode?: string;

    @Prop({ trim: true })
    vnpayHashSecret?: string;

    @Prop({ default: false })
    isActive: boolean;
}

export const PaymentSettingsSchema = SchemaFactory.createForClass(PaymentSettings);
