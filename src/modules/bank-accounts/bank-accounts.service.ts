import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as QRCode from 'qrcode';
import { BankAccount, BankAccountDocument, VIETQR_BANKS } from './bank-account.schema';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UserPayload } from '../../shared/types';
import { Bill, BillDocument } from '../bills/bills.schema';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectModel(BankAccount.name) private readonly bankAccountModel: Model<BankAccountDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
  ) {}

  /**
   * Look up VietQR bank info by code.
   */
  private resolveBankInfo(bankCode: string): { name: string; bin: string } {
    const bank = VIETQR_BANKS.find((b) => b.code === bankCode.toUpperCase());
    if (!bank) {
      throw new BadRequestException(`Unsupported bank code: ${bankCode}. Supported: ${VIETQR_BANKS.map((b) => b.code).join(', ')}`);
    }
    return { name: bank.name, bin: bank.bin };
  }

  async create(dto: CreateBankAccountDto, user: UserPayload): Promise<BankAccountDocument> {
    const ownerId = new Types.ObjectId(user.ownerId);
    const { name: bankName, bin: bankBin } = this.resolveBankInfo(dto.bankCode);

    if (dto.isDefault) {
      // Unset previous default
      await this.bankAccountModel.updateMany(
        { ownerId, isDefault: true },
        { $set: { isDefault: false } },
      );
    }

    return this.bankAccountModel.create({
      ownerId,
      bankCode: dto.bankCode.toUpperCase(),
      bankName,
      bankBin,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
      isDefault: dto.isDefault ?? false,
    });
  }

  async findAll(user: UserPayload): Promise<BankAccountDocument[]> {
    return this.bankAccountModel
      .find({ ownerId: new Types.ObjectId(user.ownerId) })
      .sort({ isDefault: -1, createdAt: 1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user: UserPayload): Promise<BankAccountDocument> {
    const account = await this.bankAccountModel
      .findOne({ _id: new Types.ObjectId(id), ownerId: new Types.ObjectId(user.ownerId) })
      .lean()
      .exec();
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  async setDefault(id: string, user: UserPayload): Promise<BankAccountDocument> {
    const ownerId = new Types.ObjectId(user.ownerId);
    await this.bankAccountModel.updateMany({ ownerId }, { $set: { isDefault: false } });
    const updated = await this.bankAccountModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), ownerId },
        { $set: { isDefault: true } },
        { new: true },
      )
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Bank account not found');
    return updated;
  }

  async remove(id: string, user: UserPayload): Promise<void> {
    const result = await this.bankAccountModel.deleteOne({
      _id: new Types.ObjectId(id),
      ownerId: new Types.ObjectId(user.ownerId),
    });
    if (result.deletedCount === 0) throw new NotFoundException('Bank account not found');
  }

  /**
   * Return a list of supported banks (for UI dropdowns).
   */
  getSupportedBanks() {
    return VIETQR_BANKS.map((b) => ({ code: b.code, name: b.name }));
  }

  /**
   * Generate a VietQR data URL for a bill.
   * VietQR format: EMVCo QR with bank BIN + account number + amount.
   */
  async generateBillQr(
    billId: string,
    ownerId: string,
  ): Promise<{ qrDataUrl: string; amount: number; accountInfo: Partial<BankAccount> }> {
    // Find default bank account for owner
    const account = await this.bankAccountModel
      .findOne({ ownerId: new Types.ObjectId(ownerId), isDefault: true })
      .lean()
      .exec();

    if (!account) {
      // Fallback to first account
      const firstAccount = await this.bankAccountModel
        .findOne({ ownerId: new Types.ObjectId(ownerId) })
        .lean()
        .exec();
      if (!firstAccount) {
        throw new NotFoundException('No bank account configured. Please add a bank account first.');
      }
      return this.buildQr(firstAccount, billId, ownerId);
    }

    return this.buildQr(account, billId, ownerId);
  }

  private async buildQr(
    account: BankAccount,
    billId: string,
    ownerId: string,
  ): Promise<{ qrDataUrl: string; amount: number; accountInfo: Partial<BankAccount> }> {
    const bill = await this.billModel
      .findOne({ _id: new Types.ObjectId(billId), ownerId: new Types.ObjectId(ownerId) })
      .lean()
      .exec();

    if (!bill) throw new NotFoundException('Bill not found');

    const amount = Math.round(bill.totalAmount - bill.paidAmount);
    const addInfo = `Tien phong T${bill.month}/${bill.year}`;

    // VietQR Quick Link format — generates a standard VietQR-compatible string
    // Format: 00020101021238[len]0010A0000007270106[len]0006[bin][len]01[acctNo]5204599953031045405[amount]5802VN62[len]08[addInfo]6304[checksum]
    // Simplified: use the VietQR URL format that most banking apps can parse
    const qrContent = buildVietQrString(
      account.bankBin,
      account.accountNumber,
      amount,
      account.accountName,
      addInfo,
    );

    const qrDataUrl = await QRCode.toDataURL(qrContent, {
      errorCorrectionLevel: 'M',
      width: 300,
      margin: 2,
    });

    return {
      qrDataUrl,
      amount,
      accountInfo: {
        bankCode: account.bankCode,
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
      },
    };
  }
}

/**
 * Build a VietQR-compatible EMVCo string.
 * Follows the VietQR specification published by NAPAS.
 * Reference: https://vietqr.io/portal-service/documents
 */
function buildVietQrString(
  bin: string,
  accountNumber: string,
  amount: number,
  accountName: string,
  addInfo: string,
): string {
  function tlv(tag: string, value: string): string {
    const len = String(value.length).padStart(2, '0');
    return `${tag}${len}${value}`;
  }

  // Merchant Account Info (38)
  const guid = tlv('00', 'A000000727');
  const acqBin = tlv('01', `00${bin}`);
  const acctNo = tlv('01', accountNumber);
  const merchantInfo = tlv('38', guid + acqBin + tlv('02', accountNumber));

  // Additional data (62)
  const addDataPurpose = tlv('08', addInfo.substring(0, 25));
  const addData = tlv('62', addDataPurpose);

  const body = [
    tlv('00', '01'), // Payload format indicator
    tlv('01', '12'), // Point of initiation (12=static, 11=dynamic)
    merchantInfo,
    tlv('52', '5999'), // Merchant category
    tlv('53', '704'), // Currency (VND = 704)
    ...(amount > 0 ? [tlv('54', String(amount))] : []),
    tlv('58', 'VN'), // Country
    tlv('59', accountName.substring(0, 25)),
    tlv('60', 'Hanoi'),
    addData,
    '6304', // CRC placeholder (to be filled)
  ].join('');

  // CRC-16/CCITT-FALSE
  const crc = crc16(body).toString(16).toUpperCase().padStart(4, '0');
  return body + crc;
}

function crc16(data: string): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return crc & 0xffff;
}
