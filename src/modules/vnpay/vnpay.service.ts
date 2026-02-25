import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import * as crypto from 'crypto';
import { format } from 'date-fns';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { BillStatus } from '../bills/enums/bill-status.enum';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { UserPayload } from '../../shared/types';

const VNPAY_SANDBOX_URL = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
const VNPAY_PRODUCTION_URL = 'https://pay.vnpay.vn/vpcpay.html';

export interface VnpayIpnQuery {
  vnp_TmnCode: string;
  vnp_Amount: string;
  vnp_BankCode?: string;
  vnp_BankTranNo?: string;
  vnp_CardType?: string;
  vnp_PayDate?: string;
  vnp_CurrCode: string;
  vnp_GW_MERCHANT_CARD_TYPE?: string;
  vnp_PromotionCode?: string;
  vnp_PromotionAmount?: string;
  vnp_OrderInfo: string;
  vnp_OrderType: string;
  vnp_ResponseCode: string;
  vnp_TransactionNo: string;
  vnp_TransactionStatus: string;
  vnp_TxnRef: string;
  vnp_SecureHashType?: string;
  vnp_SecureHash: string;
  [key: string]: string | undefined;
}

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);

  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly paymentSettingsService: PaymentSettingsService,
    private readonly configService: ConfigService,
  ) {}

  private buildSecureHash(params: Record<string, string>, hashSecret: string): string {
    // Sort params alphabetically by key
    const sortedKeys = Object.keys(params)
      .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType')
      .sort();

    const queryString = sortedKeys
      .map((k) => `${k}=${params[k]}`)
      .join('&');

    return crypto
      .createHmac('sha512', hashSecret)
      .update(Buffer.from(queryString, 'utf-8'))
      .digest('hex');
  }

  private formatDatetime(date: Date): string {
    return format(date, 'yyyyMMddHHmmss');
  }

  /**
   * Create a VNPay payment URL for a bill.
   */
  async createPayment(
    billId: string,
    user: UserPayload,
    ipAddr: string,
  ): Promise<{ paymentUrl: string; txnRef: string }> {
    const ownerId = user.ownerId;

    // Load bill
    const bill = await this.billModel
      .findOne({ _id: new Types.ObjectId(billId), ownerId: new Types.ObjectId(ownerId) })
      .lean()
      .exec();

    if (!bill) throw new NotFoundException('Bill not found');
    if (bill.status === BillStatus.PAID) throw new BadRequestException('Bill is already paid');

    const remaining = bill.totalAmount - bill.paidAmount;
    if (remaining <= 0) throw new BadRequestException('No outstanding amount');

    // Load VNPay credentials
    const creds = await this.paymentSettingsService.getDecryptedVnpayCredentials(ownerId);
    if (!creds) throw new BadRequestException('VNPay is not configured for this account');

    const settings = await this.paymentSettingsService.getByOwnerId(ownerId);
    const isProduction = settings?.environment === 'production';
    const baseUrl = isProduction ? VNPAY_PRODUCTION_URL : VNPAY_SANDBOX_URL;

    const returnUrl =
      this.configService.get<string>('vnpay.returnUrl') ||
      `${this.configService.get<string>('frontendUrl')}/tenant/bills/${billId}`;

    const txnRef = `${billId.slice(-8)}-${Date.now()}`;
    const createDate = this.formatDatetime(new Date());

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: creds.tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: txnRef,
      vnp_OrderInfo: `Hoa don thang ${bill.month}/${bill.year}`,
      vnp_OrderType: 'billpayment',
      vnp_Amount: String(Math.round(remaining) * 100),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr || '127.0.0.1',
      vnp_CreateDate: createDate,
    };

    const secureHash = this.buildSecureHash(params, creds.hashSecret);
    params['vnp_SecureHash'] = secureHash;

    const paymentUrl =
      baseUrl +
      '?' +
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${encodeURIComponent(params[k])}`)
        .join('&');

    return { paymentUrl, txnRef };
  }

  /**
   * Process IPN callback from VNPay.
   * Must respond within 5 seconds.
   */
  async processIpn(query: VnpayIpnQuery): Promise<{ RspCode: string; Message: string }> {
    try {
      // Extract and remove secure hash from params for verification
      const secureHash = query.vnp_SecureHash;
      const params: Record<string, string> = {};
      for (const [key, value] of Object.entries(query)) {
        if (key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType' && value !== undefined) {
          params[key] = value;
        }
      }

      // Find settings by TmnCode
      const tmnCode = query.vnp_TmnCode;
      const settings = await this.paymentSettingsService.getByOwnerId(
        await this.findOwnerByTmnCode(tmnCode),
      );

      if (!settings) {
        return { RspCode: '01', Message: 'Merchant not found' };
      }

      const creds = await this.paymentSettingsService.getDecryptedVnpayCredentials(
        settings.ownerId.toString(),
      );
      if (!creds) {
        return { RspCode: '01', Message: 'Credentials not configured' };
      }

      // Verify signature
      const expectedHash = this.buildSecureHash(params, creds.hashSecret);
      if (expectedHash !== secureHash) {
        return { RspCode: '97', Message: 'Invalid signature' };
      }

      // Check transaction status
      if (query.vnp_ResponseCode !== '00' || query.vnp_TransactionStatus !== '00') {
        return { RspCode: '00', Message: 'Payment failed — acknowledged' };
      }

      // Extract billId from txnRef (format: "lastchars-timestamp")
      const txnRef = query.vnp_TxnRef;
      const amount = Math.round(parseInt(query.vnp_Amount, 10) / 100);

      // Find bill by matching txnRef pattern — check for existing payment first
      const existingPayment = await this.paymentModel
        .findOne({ transactionId: `vnpay-${txnRef}` })
        .lean()
        .exec();

      if (existingPayment) {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }

      // Try to find bill — txnRef starts with last 8 chars of billId
      const billIdSuffix = txnRef.split('-')[0];
      const bill = await this.billModel
        .findOne({
          ownerId: settings.ownerId,
          $expr: {
            $eq: [{ $substr: [{ $toString: '$_id' }, 16, 8] }, billIdSuffix],
          },
        })
        .exec();

      if (!bill) {
        this.logger.warn(`VNPay IPN: cannot find bill for txnRef ${txnRef}`);
        return { RspCode: '01', Message: 'Bill not found' };
      }

      // Record payment in a transaction
      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          await this.paymentModel.create(
            [
              {
                billId: bill._id,
                amount,
                method: PaymentMethod.VNPAY,
                transactionId: `vnpay-${txnRef}`,
                status: PaymentStatus.SUCCESS,
                note: `VNPay: ${query.vnp_BankCode ?? ''} ${query.vnp_BankTranNo ?? ''}`.trim(),
                ownerId: settings.ownerId,
              },
            ],
            { session },
          );

          const newPaid = (bill.paidAmount || 0) + amount;
          const newStatus =
            newPaid >= bill.totalAmount ? BillStatus.PAID : BillStatus.PARTIAL;

          await this.billModel.updateOne(
            { _id: bill._id },
            { $set: { paidAmount: newPaid, status: newStatus } },
            { session },
          );
        });
      } finally {
        await session.endSession();
      }

      return { RspCode: '00', Message: 'Confirm success' };
    } catch (error) {
      this.logger.error('VNPay IPN error', error);
      return { RspCode: '99', Message: 'Internal error' };
    }
  }

  /**
   * Validate VNPay return URL params (for frontend display).
   */
  async validateReturn(query: VnpayIpnQuery): Promise<{
    success: boolean;
    message: string;
    amount?: number;
  }> {
    const secureHash = query.vnp_SecureHash;
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (key !== 'vnp_SecureHash' && key !== 'vnp_SecureHashType' && value !== undefined) {
        params[key] = value;
      }
    }

    try {
      const tmnCode = query.vnp_TmnCode;
      const ownerId = await this.findOwnerByTmnCode(tmnCode);
      const creds = await this.paymentSettingsService.getDecryptedVnpayCredentials(ownerId);
      if (!creds) return { success: false, message: 'Configuration error' };

      const expectedHash = this.buildSecureHash(params, creds.hashSecret);
      if (expectedHash !== secureHash) {
        return { success: false, message: 'Invalid signature' };
      }

      const success = query.vnp_ResponseCode === '00' && query.vnp_TransactionStatus === '00';
      return {
        success,
        message: success ? 'Thanh toán thành công' : 'Thanh toán thất bại',
        amount: success ? Math.round(parseInt(query.vnp_Amount, 10) / 100) : undefined,
      };
    } catch {
      return { success: false, message: 'Verification error' };
    }
  }

  /**
   * Look up ownerId by VNPay TmnCode (for IPN routing).
   * Simple linear scan — small dataset.
   */
  private async findOwnerByTmnCode(tmnCode: string): Promise<string> {
    const { PaymentSettings } = await import('../payment-settings/payment-settings.schema');
    // Use the injected model via connection
    const settingsModel = this.connection.model('PaymentSettings');
    const settings = await settingsModel.findOne({ vnpayTmnCode: tmnCode }).lean().exec();
    if (!settings) throw new NotFoundException('Merchant not found');
    return (settings as any).ownerId.toString();
  }
}
