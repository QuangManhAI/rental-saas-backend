import {
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
  PLAN_PRICES,
} from './upgrade-request.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { User, UserDocument } from '../users/users.schema';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { buildPaginatedResponse } from '../../common/dto/paginated-response.dto';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
    @InjectModel(UpgradeRequest.name) private readonly upgradeRequestModel: Model<UpgradeRequestDocument>,
    @InjectModel(Property.name) private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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

    const [subs, total] = await Promise.all([
      this.subModel
        .find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'email fullName phone')
        .lean(),
      this.subModel.countDocuments(),
    ]);

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
}
