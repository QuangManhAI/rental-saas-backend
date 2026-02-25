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
import axios from 'axios';

import { Bill, BillDocument } from '../bills/bills.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { BillStatus } from '../bills/enums/bill-status.enum';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { MomoIpnDto } from './dto/momo-ipn.dto';
import { UserPayload } from '../../shared/types';

@Injectable()
export class MomoService {
  private readonly logger = new Logger(MomoService.name);

  // MoMo endpoint — environment (sandbox/production) controlled per-owner via PaymentSettings
  private readonly MOMO_SANDBOX_ENDPOINT =
    'https://test-payment.momo.vn/v2/gateway/api/create';
  private readonly MOMO_PRODUCTION_ENDPOINT =
    'https://payment.momo.vn/v2/gateway/api/create';

  constructor(
    @InjectModel(Bill.name)
    private readonly billModel: Model<BillDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly paymentSettingsService: PaymentSettingsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a MoMo payment request for a specific bill.
   */
  async createPayment(
    billId: string,
    user: UserPayload,
    force = false,
  ): Promise<{
    payUrl: string;
    orderId: string;
    deeplink?: string;
    applink?: string;
    qrCodeUrl?: string;
  }> {
    // 1. Load and validate bill
    const bill = await this.billModel.findOne({
      _id: new Types.ObjectId(billId),
      ownerId: new Types.ObjectId(user.ownerId),
    });

    if (!bill) {
      throw new NotFoundException('Bill not found or access denied');
    }

    if (bill.status === BillStatus.PAID && !force) {
      throw new BadRequestException('Bill is already fully paid');
    }

    // 2. Get owner's decrypted MoMo credentials — NO env fallback in production
    const creds = await this.paymentSettingsService.getDecryptedMomoCredentials(user.ownerId);

    if (!creds) {
      throw new BadRequestException(
        'MoMo credentials not configured. Vui lòng cấu hình thông tin thanh toán MoMo trong Cài đặt.',
      );
    }

    const { partnerCode, accessKey, secretKey, environment } = creds;
    const endpoint =
      environment === 'production'
        ? this.MOMO_PRODUCTION_ENDPOINT
        : this.MOMO_SANDBOX_ENDPOINT;

    // 3. Prepare payment request
    const orderId = `${billId}_${Date.now()}`;
    const requestId = orderId;
    let amount = bill.totalAmount - bill.paidAmount;

    if (force && amount <= 0) {
      amount = bill.totalAmount;
    }

    if (amount <= 0) {
      throw new BadRequestException('Invalid payment amount');
    }

    const orderInfo = `Thanh toan hoa don ${bill.month}/${bill.year}`;
    const redirectUrl =
      this.configService.get('MOMO_REDIRECT_URL') || 'http://localhost:3001/payment/result';
    const ipnUrl =
      this.configService.get('MOMO_IPN_URL') ||
      'http://localhost:3000/api/momo/ipn';
    const extraData = '';
    const requestType = 'captureWallet';

    // 4. Generate signature
    const rawSignature = [
      `accessKey=${accessKey}`,
      `amount=${amount}`,
      `extraData=${extraData}`,
      `ipnUrl=${ipnUrl}`,
      `orderId=${orderId}`,
      `orderInfo=${orderInfo}`,
      `partnerCode=${partnerCode}`,
      `redirectUrl=${redirectUrl}`,
      `requestId=${requestId}`,
      `requestType=${requestType}`,
    ].join('&');

    const signature = this.generateSignature(rawSignature, secretKey);

    const requestBody = {
      partnerCode,
      accessKey,
      requestId,
      amount,
      orderId,
      orderInfo,
      redirectUrl,
      ipnUrl,
      extraData,
      requestType,
      signature,
      lang: 'vi',
    };

    this.logger.log(`Creating MoMo payment: orderId=${orderId}, amount=${amount}`);

    try {
      const response = await axios.post(endpoint, requestBody, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.resultCode !== 0) {
        this.logger.error(`MoMo error: ${response.data.message}`);
        throw new BadRequestException(`MoMo error: ${response.data.message}`);
      }

      return {
        payUrl: response.data.payUrl,
        deeplink: response.data.deeplink,
        applink: response.data.applink,
        qrCodeUrl: response.data.qrCodeUrl,
        orderId,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `MoMo API error: ${error.response?.data?.message || error.message}`,
        );
        throw new InternalServerErrorException('Failed to create MoMo payment');
      }
      throw error;
    }
  }

  /**
   * Handle MoMo IPN (Instant Payment Notification) callback.
   *
   * Idempotency: uses unique transactionId index to prevent duplicate processing.
   * Atomicity: wrapped in a MongoDB session transaction.
   */
  async handleIpn(payload: MomoIpnDto): Promise<{ message: string }> {
    this.logger.log(
      `IPN received: orderId=${payload.orderId}, resultCode=${payload.resultCode}, transId=${payload.transId}`,
    );

    // 1. Resolve owner's decrypted credentials by partnerCode
    const creds =
      await this.paymentSettingsService.getDecryptedCredentialsByPartnerCode(
        payload.partnerCode,
      );

    if (!creds) {
      this.logger.error(`Unknown or unconfigured partnerCode: ${payload.partnerCode}`);
      throw new BadRequestException('Unknown partnerCode');
    }

    // 2. Verify signature using owner's decrypted secretKey
    const rawSignature = [
      `accessKey=${creds.accessKey}`,
      `amount=${payload.amount}`,
      `extraData=${payload.extraData || ''}`,
      `message=${payload.message}`,
      `orderId=${payload.orderId}`,
      `orderInfo=${payload.orderInfo}`,
      `orderType=${payload.orderType}`,
      `partnerCode=${payload.partnerCode}`,
      `payType=${payload.payType}`,
      `requestId=${payload.requestId}`,
      `responseTime=${payload.responseTime}`,
      `resultCode=${payload.resultCode}`,
      `transId=${payload.transId}`,
    ].join('&');

    const expectedSignature = this.generateSignature(rawSignature, creds.secretKey);

    if (payload.signature !== expectedSignature) {
      this.logger.error(
        `Invalid MoMo signature for orderId=${payload.orderId}`,
      );
      throw new BadRequestException('Invalid signature');
    }

    // 3. Ignore failed payments
    if (payload.resultCode !== 0) {
      this.logger.warn(
        `Payment failed: orderId=${payload.orderId}, resultCode=${payload.resultCode}`,
      );
      return { message: 'Payment failed — no action taken' };
    }

    const transactionId = String(payload.transId);

    // 4. Idempotency check — if we already recorded this transId, skip
    const existingPayment = await this.paymentModel.findOne({ transactionId });
    if (existingPayment) {
      this.logger.log(
        `Duplicate IPN ignored: transId=${transactionId} already processed`,
      );
      return { message: 'Already processed' };
    }

    // 5. Extract billId from orderId (format: {billId}_{timestamp})
    const billId = payload.orderId.split('_')[0];

    // 6. Process in a MongoDB transaction for atomicity
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const bill = await this.billModel.findById(billId).session(session);

      if (!bill) {
        await session.abortTransaction();
        this.logger.error(`Bill not found for IPN: billId=${billId}`);
        throw new NotFoundException('Bill not found');
      }

      // Secondary idempotency guard (bill fully paid)
      if (bill.status === BillStatus.PAID) {
        await session.abortTransaction();
        this.logger.log(`Bill ${billId} already fully paid — IPN ignored`);
        return { message: 'Already processed' };
      }

      // 7. Create payment record
      await this.paymentModel.create(
        [
          {
            billId: bill._id,
            amount: payload.amount,
            method: PaymentMethod.MOMO,
            transactionId,
            status: PaymentStatus.SUCCESS,
            note: `MoMo: ${payload.orderId}`,
            ownerId: bill.ownerId,
          },
        ],
        { session },
      );

      // 8. Recalculate total paid from all non-deleted payments for this bill
      const result = await this.paymentModel
        .aggregate([
          { $match: { billId: bill._id, isDeleted: { $ne: true } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
        .session(session);

      const newPaidAmount = result.length > 0 ? (result[0].total as number) : payload.amount;
      bill.paidAmount = newPaidAmount;
      bill.status =
        newPaidAmount >= bill.totalAmount ? BillStatus.PAID : BillStatus.PARTIAL;

      await bill.save({ session });
      await session.commitTransaction();

      this.logger.log(
        `Bill ${billId} updated via MoMo IPN: paidAmount=${newPaidAmount}, status=${bill.status}`,
      );

      return { message: 'Success' };
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      session.endSession();
    }
  }

  private generateSignature(rawData: string, secretKey: string): string {
    return crypto.createHmac('sha256', secretKey).update(rawData).digest('hex');
  }
}
