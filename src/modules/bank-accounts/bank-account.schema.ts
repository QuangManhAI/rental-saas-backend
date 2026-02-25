import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BankAccountDocument = HydratedDocument<BankAccount>;

// Common Vietnamese bank codes for VietQR
export const VIETQR_BANKS = [
  { code: 'VCB', name: 'Vietcombank', bin: '970436' },
  { code: 'TCB', name: 'Techcombank', bin: '970407' },
  { code: 'ACB', name: 'ACB', bin: '970416' },
  { code: 'MBB', name: 'MB Bank', bin: '970422' },
  { code: 'VPB', name: 'VPBank', bin: '970432' },
  { code: 'BIDV', name: 'BIDV', bin: '970418' },
  { code: 'VTB', name: 'Vietinbank', bin: '970415' },
  { code: 'AGR', name: 'Agribank', bin: '970405' },
  { code: 'TPB', name: 'TPBank', bin: '970423' },
  { code: 'STB', name: 'Sacombank', bin: '970403' },
  { code: 'HDB', name: 'HDBank', bin: '970437' },
  { code: 'OCB', name: 'OCB', bin: '970448' },
  { code: 'MSB', name: 'MSB', bin: '970426' },
  { code: 'SHB', name: 'SHB', bin: '970443' },
  { code: 'EIB', name: 'Eximbank', bin: '970431' },
] as const;

@Schema({ timestamps: true })
export class BankAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  bankCode: string; // e.g. 'VCB', 'TCB'

  @Prop({ required: true, trim: true })
  bankName: string; // e.g. 'Vietcombank'

  @Prop({ required: true, trim: true })
  bankBin: string; // 6-digit BIN for VietQR

  @Prop({ required: true, trim: true })
  accountNumber: string;

  @Prop({ required: true, trim: true })
  accountName: string; // Account holder name

  @Prop({ default: false })
  isDefault: boolean;
}

export const BankAccountSchema = SchemaFactory.createForClass(BankAccount);

BankAccountSchema.index({ ownerId: 1, isDefault: 1 });
