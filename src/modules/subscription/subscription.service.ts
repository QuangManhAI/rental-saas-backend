import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import axios from 'axios';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionPlan,
  SubscriptionStatus,
  PLAN_LIMITS,
} from './subscription.schema';
import {
  UpgradeRequest,
  UpgradeRequestDocument,
  UpgradeRequestStatus,
  PaymentMethod,
  PLAN_PRICES,
} from './upgrade-request.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { User, UserDocument } from '../users/users.schema';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { UpsertPaymentSettingsDto } from '../payment-settings/dto/upsert-payment-settings.dto';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { buildPaginatedResponse } from '../../common/dto/paginated-response.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  private readonly MOMO_SANDBOX_ENDPOINT =
    'https://test-payment.momo.vn/v2/gateway/api/create';
  private readonly MOMO_PRODUCTION_ENDPOINT =
    'https://payment.momo.vn/v2/gateway/api/create';

  constructor(
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(UpgradeRequest.name) private readonly upgradeRequestModel: Model<UpgradeRequestDocument>,
    @InjectModel(Property.name) private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly paymentSettingsService: PaymentSettingsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Called on new user registration — creates a 14-day BASIC trial subscription.
   * After trial expires the cron job downgrades to FREE limits.
   */
  async createFreeSubscription(ownerId: string): Promise<SubscriptionDocument> {
    const basicLimits = PLAN_LIMITS[SubscriptionPlan.BASIC];
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    return this.subModel.create({
      ownerId: new Types.ObjectId(ownerId),
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.TRIAL,
      trialEndsAt,
      currentPeriodStart: new Date(),
      roomLimit: basicLimits.roomLimit,
      propertyLimit: basicLimits.propertyLimit,
      staffLimit: basicLimits.staffLimit,
      features: basicLimits.features,
    });
  }

  async getMySubscription(ownerId: string): Promise<SubscriptionDocument> {
    const existing = await this.subModel.findOne({ ownerId: new Types.ObjectId(ownerId) });
    if (!existing) return this.createFreeSubscription(ownerId);

    // Normalize missing limits (handles old documents created before these fields were added)
    if (existing.propertyLimit == null || existing.staffLimit == null || existing.roomLimit == null) {
      const planForLimits =
        existing.status === SubscriptionStatus.TRIAL
          ? SubscriptionPlan.BASIC
          : (existing.plan as SubscriptionPlan) ?? SubscriptionPlan.FREE;
      const limits = PLAN_LIMITS[planForLimits] ?? PLAN_LIMITS[SubscriptionPlan.FREE];
      const updated = await this.subModel.findOneAndUpdate(
        { ownerId: new Types.ObjectId(ownerId) },
        {
          $set: {
            propertyLimit: existing.propertyLimit ?? limits.propertyLimit,
            roomLimit: existing.roomLimit ?? limits.roomLimit,
            staffLimit: existing.staffLimit ?? limits.staffLimit,
          },
        },
        { new: true },
      );
      return updated ?? existing;
    }

    return existing;
  }

  /**
   * Check if ownerId's subscription includes a specific feature.
   * Throws HTTP 402 if feature is not available on current plan.
   */
  async checkFeature(ownerId: string, feature: string): Promise<void> {
    const sub = await this.getMySubscription(ownerId);
    if (!sub.features.includes(feature)) {
      throw new HttpException(
        `Tính năng này không có trong gói ${sub.plan}. Vui lòng nâng cấp để sử dụng.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /**
   * Check if ownerId has reached their property limit.
   * Throws HTTP 402 Payment Required if limit exceeded.
   */
  async checkPropertyLimit(ownerId: string): Promise<void> {
    const sub = await this.getMySubscription(ownerId);
    if (sub.propertyLimit === -1) return; // unlimited

    const count = await this.propertyModel.countDocuments({
      ownerId: new Types.ObjectId(ownerId),
    });

    if (count >= sub.propertyLimit) {
      throw new HttpException(
        `Gói ${sub.plan} giới hạn ${sub.propertyLimit} tòa nhà. Nâng cấp để thêm nhiều hơn.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /**
   * Check if ownerId has reached their room limit.
   * Throws HTTP 402 Payment Required if limit exceeded.
   */
  async checkRoomLimit(ownerId: string): Promise<void> {
    const sub = await this.getMySubscription(ownerId);
    if (sub.roomLimit === -1) return; // unlimited

    const count = await this.roomModel.countDocuments({
      ownerId: new Types.ObjectId(ownerId),
    });

    if (count >= sub.roomLimit) {
      throw new HttpException(
        `Gói ${sub.plan} giới hạn ${sub.roomLimit} phòng. Nâng cấp để thêm nhiều hơn.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /**
   * Check if ownerId has reached their staff limit.
   * Throws HTTP 402 Payment Required if limit exceeded.
   */
  async checkStaffLimit(ownerId: string): Promise<void> {
    const sub = await this.getMySubscription(ownerId);
    if (sub.staffLimit === -1) return; // unlimited

    // Count staff accounts belonging to this owner (exclude the owner themselves)
    const count = await this.userModel.countDocuments({
      ownerId: new Types.ObjectId(ownerId),
      _id: { $ne: new Types.ObjectId(ownerId) },
    });

    if (count >= sub.staffLimit) {
      throw new HttpException(
        `Gói ${sub.plan} giới hạn ${sub.staffLimit} nhân viên. Nâng cấp để thêm nhiều hơn.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }

  /**
   * Owner: get real-time usage counts + plan limits in a single query.
   * Used by the frontend status card — replaces 3 separate count API calls.
   */
  async getUsage(ownerId: string) {
    const sub = await this.getMySubscription(ownerId);
    const ownerObjId = new Types.ObjectId(ownerId);

    const [propertyCount, roomCount, staffCount] = await Promise.all([
      this.propertyModel.countDocuments({ ownerId: ownerObjId }),
      this.roomModel.countDocuments({ ownerId: ownerObjId }),
      this.userModel.countDocuments({
        ownerId: ownerObjId,
        _id: { $ne: ownerObjId }, // exclude the owner's own account
      }),
    ]);

    return {
      plan: sub.plan,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt ?? null,
      propertyCount,
      roomCount,
      staffCount,
      propertyLimit: sub.propertyLimit,
      roomLimit: sub.roomLimit,
      staffLimit: sub.staffLimit,
    };
  }

  /**
   * Admin: activate a paid plan for an owner.
   */
  async activatePlan(
    ownerId: string,
    plan: SubscriptionPlan,
    months: number,
    notes?: string,
  ): Promise<SubscriptionDocument> {
    const limits = PLAN_LIMITS[plan];
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + months);

    const sub = await this.subModel.findOneAndUpdate(
      { ownerId: new Types.ObjectId(ownerId) },
      {
        plan,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        roomLimit: limits.roomLimit,
        propertyLimit: limits.propertyLimit,
        staffLimit: limits.staffLimit,
        features: limits.features,
        notes,
      },
      { new: true, upsert: true },
    );

    this.logger.log(`Plan activated: owner=${ownerId}, plan=${plan}, months=${months}`);
    return sub;
  }

  /**
   * Admin: list all subscriptions with pagination.
   */
  async findAll(query: PaginationDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [allSubs, total] = await Promise.all([
      this.subModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'email fullName phone')
        .lean(),
      this.subModel.countDocuments(),
    ]);

    // Filter out orphan subscriptions whose owner user has been deleted
    const subs = allSubs.filter((s) => s.ownerId !== null);

    return buildPaginatedResponse(subs, total, page, limit);
  }

  /**
   * Admin: find subscription by ownerId.
   */
  async findByOwner(ownerId: string) {
    const sub = await this.subModel
      .findOne({ ownerId: new Types.ObjectId(ownerId) })
      .populate('ownerId', 'email fullName phone');
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  /**
   * Owner: submit an upgrade request (pending admin approval).
   */
  async requestUpgrade(
    ownerId: string,
    toPlan: string,
    months: number,
    paymentMethod: string,
    notes?: string,
  ): Promise<UpgradeRequestDocument> {
    const sub = await this.getMySubscription(ownerId);
    const amount = (PLAN_PRICES[toPlan] ?? 0) * months;

    const request = await this.upgradeRequestModel.create({
      ownerId: new Types.ObjectId(ownerId),
      fromPlan: sub.plan,
      toPlan,
      months,
      amount,
      paymentMethod,
      notes,
      status: UpgradeRequestStatus.PENDING,
    });

    this.logger.log(`Upgrade request: owner=${ownerId}, ${sub.plan}→${toPlan}, ${months}mo, ${paymentMethod}`);
    return request;
  }

  /**
   * Owner: get their payment/upgrade request history.
   */
  async getPaymentHistory(ownerId: string) {
    return this.upgradeRequestModel
      .find({ ownerId: new Types.ObjectId(ownerId) })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
  }

  /**
   * Cron: expire overdue paid subscriptions and end trials.
   * Called daily.
   */
  async expireOverdueSubscriptions(): Promise<number> {
    const now = new Date();
    const freeLimits = PLAN_LIMITS[SubscriptionPlan.FREE];

    // 1. Expire paid ACTIVE plans past their currentPeriodEnd
    const paidResult = await this.subModel.updateMany(
      {
        status: SubscriptionStatus.ACTIVE,
        plan: { $ne: SubscriptionPlan.FREE },
        currentPeriodEnd: { $lt: now },
      },
      {
        status: SubscriptionStatus.EXPIRED,
        plan: SubscriptionPlan.FREE,
        roomLimit: freeLimits.roomLimit,
        propertyLimit: freeLimits.propertyLimit,
        staffLimit: freeLimits.staffLimit,
        features: freeLimits.features,
      },
    );

    // 2. Downgrade TRIAL subscriptions past their trialEndsAt → ACTIVE FREE
    const trialResult = await this.subModel.updateMany(
      {
        status: SubscriptionStatus.TRIAL,
        trialEndsAt: { $lt: now },
      },
      {
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.FREE,
        roomLimit: freeLimits.roomLimit,
        propertyLimit: freeLimits.propertyLimit,
        staffLimit: freeLimits.staffLimit,
        features: freeLimits.features,
      },
    );

    const total = paidResult.modifiedCount + trialResult.modifiedCount;
    if (total > 0) {
      this.logger.log(
        `Subscription cron: expired ${paidResult.modifiedCount} paid, ${trialResult.modifiedCount} trials → downgraded to free`,
      );
    }
    return total;
  }

  // ── Admin Payment Settings ────────────────────────────────────────────────

  /**
   * Find the first admin user in the system.
   */
  private async findAdminUser(): Promise<UserDocument> {
    const admin = await this.userModel.findOne({ role: Role.ADMIN });
    if (!admin) throw new NotFoundException('No admin user found');
    return admin;
  }

  /**
   * Get admin's payment settings (MoMo config status for receiving subscription payments).
   */
  async getAdminPaymentSettings() {
    const admin = await this.findAdminUser();
    const settings = await this.paymentSettingsService.getByOwnerId(admin._id.toString());
    if (!settings) {
      return { configured: false, partnerCode: null, isActive: false, environment: 'sandbox' };
    }
    return {
      configured: !!settings.momoPartnerCode,
      partnerCode: settings.momoPartnerCode ?? null,
      isActive: settings.isActive,
      environment: settings.environment,
    };
  }

  /**
   * Upsert admin's MoMo credentials for subscription payments.
   */
  async upsertAdminPaymentSettings(dto: UpsertPaymentSettingsDto) {
    const admin = await this.findAdminUser();
    const result = await this.paymentSettingsService.upsert(admin._id.toString(), dto);
    this.logger.log(`Admin payment settings updated by admin=${admin._id}`);
    return {
      configured: !!result.momoPartnerCode,
      partnerCode: result.momoPartnerCode ?? null,
      isActive: result.isActive,
      environment: result.environment,
    };
  }

  // ── MoMo Subscription Payment ─────────────────────────────────────────────

  /**
   * Create a MoMo payment for subscription upgrade using admin's MoMo credentials.
   */
  async createSubscriptionMomoPayment(
    ownerId: string,
    toPlan: string,
    months: number,
  ): Promise<{ payUrl: string; orderId: string; amount: number }> {
    const price = PLAN_PRICES[toPlan];
    if (!price) throw new BadRequestException(`Invalid plan: ${toPlan}`);

    const amount = price * months;
    if (amount <= 0) throw new BadRequestException('Invalid payment amount');

    // Get admin's MoMo credentials
    const admin = await this.findAdminUser();
    const creds = await this.paymentSettingsService.getDecryptedMomoCredentials(admin._id.toString());
    if (!creds) {
      throw new BadRequestException(
        'Admin chưa cấu hình thanh toán MoMo. Vui lòng liên hệ admin.',
      );
    }

    const { partnerCode, accessKey, secretKey, environment } = creds;
    const endpoint = environment === 'production'
      ? this.MOMO_PRODUCTION_ENDPOINT
      : this.MOMO_SANDBOX_ENDPOINT;

    // orderId format: sub_{ownerId}_{plan}_{months}_{timestamp}
    const orderId = `sub_${ownerId}_${toPlan}_${months}_${Date.now()}`;
    const requestId = orderId;
    const orderInfo = `Nang cap goi ${toPlan.toUpperCase()} - ${months} thang`;
    const domain = this.configService.get('DOMAIN') || 'http://localhost:3001';
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/subscription?payment=success`;
    const ipnUrl = `${domain}/api/subscriptions/momo-ipn`;
    const extraData = '';
    const requestType = 'captureWallet';

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

    const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

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

    this.logger.log(`Creating MoMo subscription payment: orderId=${orderId}, amount=${amount}`);

    try {
      const response = await axios.post(endpoint, requestBody, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.data.resultCode !== 0) {
        this.logger.error(`MoMo error: ${response.data.message}`);
        throw new BadRequestException(`MoMo error: ${response.data.message}`);
      }

      // Create upgrade request with pending status (will be approved on IPN)
      const sub = await this.getMySubscription(ownerId);
      await this.upgradeRequestModel.create({
        ownerId: new Types.ObjectId(ownerId),
        fromPlan: sub.plan,
        toPlan,
        months,
        amount,
        paymentMethod: PaymentMethod.MOMO,
        status: UpgradeRequestStatus.PENDING,
        notes: `MoMo orderId: ${orderId}`,
      });

      return {
        payUrl: response.data.payUrl,
        orderId,
        amount,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`MoMo API error: ${error.response?.data?.message || error.message}`);
        throw new BadRequestException('Không thể tạo thanh toán MoMo. Vui lòng thử lại.');
      }
      throw error;
    }
  }

  /**
   * Handle MoMo IPN for subscription payments.
   * Verifies signature, activates plan on success.
   */
  async handleSubscriptionMomoIpn(payload: any): Promise<{ message: string }> {
    this.logger.log(
      `Subscription IPN: orderId=${payload.orderId}, resultCode=${payload.resultCode}, transId=${payload.transId}`,
    );

    // Get admin's MoMo credentials for signature verification
    const admin = await this.findAdminUser();
    const creds = await this.paymentSettingsService.getDecryptedMomoCredentials(admin._id.toString());
    if (!creds) {
      this.logger.error('Admin MoMo credentials not configured for IPN verification');
      throw new BadRequestException('Admin MoMo not configured');
    }

    // Verify signature
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

    const expectedSignature = crypto
      .createHmac('sha256', creds.secretKey)
      .update(rawSignature)
      .digest('hex');

    if (payload.signature !== expectedSignature) {
      this.logger.error(`Invalid subscription IPN signature for orderId=${payload.orderId}`);
      throw new BadRequestException('Invalid signature');
    }

    // Ignore failed payments
    if (payload.resultCode !== 0) {
      this.logger.warn(`Subscription payment failed: orderId=${payload.orderId}, resultCode=${payload.resultCode}`);
      return { message: 'Payment failed — no action taken' };
    }

    // Parse orderId: sub_{ownerId}_{plan}_{months}_{timestamp}
    const parts = payload.orderId.split('_');
    if (parts.length < 5 || parts[0] !== 'sub') {
      this.logger.error(`Invalid subscription orderId format: ${payload.orderId}`);
      throw new BadRequestException('Invalid orderId format');
    }

    const ownerId = parts[1];
    const plan = parts[2] as SubscriptionPlan;
    const months = parseInt(parts[3], 10);

    if (!PLAN_LIMITS[plan] || isNaN(months) || months < 1) {
      this.logger.error(`Invalid plan/months in orderId: plan=${plan}, months=${months}`);
      throw new BadRequestException('Invalid plan or months');
    }

    // Activate the subscription
    await this.activatePlan(ownerId, plan, months, `MoMo payment: transId=${payload.transId}`);

    // Update the upgrade request to approved
    await this.upgradeRequestModel.findOneAndUpdate(
      { notes: { $regex: payload.orderId }, status: UpgradeRequestStatus.PENDING },
      { status: UpgradeRequestStatus.APPROVED },
    );

    this.logger.log(`Subscription activated via MoMo: owner=${ownerId}, plan=${plan}, months=${months}`);
    return { message: 'Success' };
  }
}
