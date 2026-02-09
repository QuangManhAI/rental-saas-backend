import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Logger,
    InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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

/**
 * MoMo Payment Service
 * 
 * Multi-tenant implementation:
 * - Each owner has their own MoMo credentials in PaymentSettings
 * - Payments are linked to specific owners via bills
 * - IPN callback resolves owner dynamically by partnerCode
 */
@Injectable()
export class MomoService {
    private readonly logger = new Logger(MomoService.name);

    // MoMo Sandbox endpoint (NEVER use production in this implementation)
    private readonly MOMO_ENDPOINT = 'https://test-payment.momo.vn/v2/gateway/api/create';

    constructor(
        @InjectModel(Bill.name)
        private readonly billModel: Model<BillDocument>,
        @InjectModel(Payment.name)
        private readonly paymentModel: Model<PaymentDocument>,
        private readonly paymentSettingsService: PaymentSettingsService,
        private readonly configService: ConfigService,
    ) { }

    /**
     * Create a MoMo payment request for a specific bill
     * 
     * Flow:
     * 1. Load and validate bill
     * 2. Get owner's MoMo credentials from PaymentSettings
     * 3. Generate signature and create payment request
     * 4. Return payUrl for frontend redirect
     */
    async createPayment(
        billId: string,
        user: UserPayload,
    ): Promise<{ payUrl: string; orderId: string }> {
        // 1. Load and validate bill
        const bill = await this.billModel.findOne({
            _id: new Types.ObjectId(billId),
            ownerId: new Types.ObjectId(user.ownerId),
        });

        if (!bill) {
            throw new NotFoundException('Bill not found or access denied');
        }

        if (bill.status === BillStatus.PAID) {
            throw new BadRequestException('Bill is already fully paid');
        }

        // 2. Get owner's MoMo credentials
        const settings = await this.paymentSettingsService.getActiveSettings(user.ownerId);

        if (!settings.momoPartnerCode || !settings.momoAccessKey || !settings.momoSecretKey) {
            // Fallback to sandbox credentials for development
            this.logger.warn(`Owner ${user.ownerId} has no MoMo credentials, using sandbox fallback`);
        }

        const partnerCode = settings.momoPartnerCode || this.configService.get('MOMO_PARTNER_CODE');
        const accessKey = settings.momoAccessKey || this.configService.get('MOMO_ACCESS_KEY');
        const secretKey = settings.momoSecretKey || this.configService.get('MOMO_SECRET_KEY');

        if (!partnerCode || !accessKey || !secretKey) {
            throw new BadRequestException('MoMo credentials not configured');
        }

        // 3. Prepare payment request
        const orderId = `${billId}_${Date.now()}`;
        const requestId = orderId;
        const amount = bill.totalAmount - bill.paidAmount; // Remaining amount
        const orderInfo = `Thanh toan hoa don ${bill.month}/${bill.year}`;
        const redirectUrl = this.configService.get('MOMO_REDIRECT_URL') || 'http://localhost:3000/payment/result';
        const ipnUrl = this.configService.get('MOMO_IPN_URL') || 'http://localhost:4000/momo/ipn';
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

        // 5. Make API request to MoMo
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
            const response = await axios.post(this.MOMO_ENDPOINT, requestBody, {
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.data.resultCode !== 0) {
                this.logger.error(`MoMo error: ${response.data.message}`);
                throw new BadRequestException(`MoMo error: ${response.data.message}`);
            }

            this.logger.log(`MoMo payUrl generated for orderId=${orderId}`);

            return {
                payUrl: response.data.payUrl,
                orderId,
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                this.logger.error(`MoMo API error: ${error.response?.data?.message || error.message}`);
                throw new InternalServerErrorException('Failed to create MoMo payment');
            }
            throw error;
        }
    }

    /**
     * Handle MoMo IPN (Instant Payment Notification) callback
     * 
     * Multi-tenant flow:
     * 1. Extract partnerCode to identify owner
     * 2. Load owner's secretKey
     * 3. Verify signature
     * 4. Update bill status if payment successful
     */
    async handleIpn(payload: MomoIpnDto): Promise<{ message: string }> {
        this.logger.log(`IPN received: orderId=${payload.orderId}, resultCode=${payload.resultCode}`);

        // 1. Find owner by partnerCode
        const settings = await this.paymentSettingsService.findByPartnerCode(payload.partnerCode);

        if (!settings) {
            // Fallback to sandbox credentials
            const sandboxPartnerCode = this.configService.get('MOMO_PARTNER_CODE');
            if (payload.partnerCode !== sandboxPartnerCode) {
                this.logger.error(`Unknown partnerCode: ${payload.partnerCode}`);
                throw new BadRequestException('Unknown partnerCode');
            }
        }

        // 2. Get secretKey for signature verification
        const secretKey = settings?.momoSecretKey || this.configService.get('MOMO_SECRET_KEY');

        if (!secretKey) {
            this.logger.error('No secretKey available for signature verification');
            throw new InternalServerErrorException('Configuration error');
        }

        // 3. Verify signature
        const rawSignature = [
            `accessKey=${settings?.momoAccessKey || this.configService.get('MOMO_ACCESS_KEY')}`,
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

        const expectedSignature = this.generateSignature(rawSignature, secretKey);

        if (payload.signature !== expectedSignature) {
            this.logger.error('Invalid MoMo signature');
            throw new BadRequestException('Invalid signature');
        }

        // 4. Check if payment was successful
        if (payload.resultCode !== 0) {
            this.logger.warn(`Payment failed: orderId=${payload.orderId}, resultCode=${payload.resultCode}`);
            return { message: 'Payment failed' };
        }

        // 5. Extract billId from orderId (format: {billId}_{timestamp})
        const billId = payload.orderId.split('_')[0];

        // 6. Load bill and check idempotency
        const bill = await this.billModel.findById(billId);

        if (!bill) {
            this.logger.error(`Bill not found: ${billId}`);
            throw new NotFoundException('Bill not found');
        }

        if (bill.status === BillStatus.PAID) {
            this.logger.log(`Bill ${billId} already paid (idempotent)`);
            return { message: 'Already processed' };
        }

        // 7. Create payment record
        await this.paymentModel.create({
            billId: bill._id,
            amount: payload.amount,
            method: PaymentMethod.MOMO,
            transactionId: String(payload.transId),
            status: PaymentStatus.SUCCESS,
            note: `MoMo: ${payload.orderId}`,
            ownerId: bill.ownerId,
        });

        // 8. Update bill status
        const newPaidAmount = bill.paidAmount + payload.amount;
        bill.paidAmount = newPaidAmount;

        if (newPaidAmount >= bill.totalAmount) {
            bill.status = BillStatus.PAID;
        } else {
            bill.status = BillStatus.PARTIAL;
        }

        await bill.save();

        this.logger.log(`Bill ${billId} updated: paidAmount=${newPaidAmount}, status=${bill.status}`);

        return { message: 'Success' };
    }

    /**
     * Generate HMAC SHA256 signature
     */
    private generateSignature(rawData: string, secretKey: string): string {
        return crypto
            .createHmac('sha256', secretKey)
            .update(rawData)
            .digest('hex');
    }
}
