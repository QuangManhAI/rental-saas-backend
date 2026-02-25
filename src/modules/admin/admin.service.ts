import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../users/users.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { Subscription, SubscriptionDocument } from '../subscription/subscription.schema';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { buildPaginatedResponse } from '../../common/dto/paginated-response.dto';
import { Role } from '../../common/enums/role.enum';

@Injectable() // Decorator to mark this class as a provider that can be injected into controllers or other services
export class AdminService {
  // Declaration of the constructor with dependency injection for Mongoose models
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Property.name) private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Subscription.name) private readonly subModel: Model<SubscriptionDocument>,
  ) {}

  /**
   * System-wide dashboard stats.
   */
  async getDashboardStats() {
    // Use Promise.all to fetch all stats in parallel for better performance with Mongoose queries
    const [
      totalUsers,
      totalOwners,
      totalProperties,
      totalRooms,
      totalBills,
      totalPaymentsResult,
      planBreakdown,
      recentUsers,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ role: Role.OWNER }),
      this.propertyModel.countDocuments(),
      this.roomModel.countDocuments(),
      this.billModel.countDocuments(),
      this.paymentModel.aggregate([
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.subModel.aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 } } },
      ]),
      this.userModel
        .find({ role: Role.OWNER })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('email fullName createdAt isActive')
        .lean(),
    ]);

    const totalRevenue = totalPaymentsResult[0]?.total ?? 0;

    return {
      users: {
        total: totalUsers,
        owners: totalOwners,
        staff: totalUsers - totalOwners,
      },
      properties: totalProperties,
      rooms: totalRooms,
      bills: totalBills,
      totalRevenue,
      planBreakdown: planBreakdown.reduce(
        (acc: Record<string, number>, item: { _id: string; count: number }) => {
          acc[item._id] = item.count;
          return acc;
        },
        {},
      ),
      recentUsers,
    };
  }

  /**
   * List all owner users with pagination and optional search.
   */
  async listUsers(query: PaginationDto & { search?: string; role?: string }) {
    const { page = 1, limit = 20, search, role } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-password')
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(users, total, page, limit);
  }

  /**
   * Get a single user with their subscription.
   */
  async getUser(userId: string) {
    const user = await this.userModel.findById(userId).select('-password').lean();
    if (!user) throw new NotFoundException('User not found');

    const sub = await this.subModel.findOne({ ownerId: new Types.ObjectId(userId) }).lean();
    return { user, subscription: sub };
  }

  /**
   * Toggle user active status.
   */
  async toggleUserActive(userId: string): Promise<UserDocument> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.isActive = !user.isActive;
    return user.save();
  }

  /**
   * System health metrics.
   */
  async getSystemHealth() {
    const [totalUsers, totalBills, totalPayments] = await Promise.all([
      this.userModel.countDocuments(),
      this.billModel.countDocuments(),
      this.paymentModel.countDocuments(),
    ]);

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        users: totalUsers,
        bills: totalBills,
        payments: totalPayments,
      },
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      nodeVersion: process.version,
    };
  }
}
