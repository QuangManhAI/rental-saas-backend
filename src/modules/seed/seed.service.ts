import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument } from '../users/users.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { RefreshToken } from '../auth/auth.schema';
import {
  Subscription,
  SubscriptionDocument,
  SubscriptionPlan,
  SubscriptionStatus,
  PLAN_LIMITS,
} from '../subscription/subscription.schema';

import { Role } from '../../common/enums/role.enum';
import { RoomStatus } from '../rooms/enums/room-status.enum';
import { ContractStatus } from '../contracts/enums/contract-status.enum';
import { BillStatus } from '../bills/enums/bill-status.enum';
import { PaymentMethod } from '../payments/enums/payment-method.enum';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<any>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) { }

  /* ───── helpers ───── */

  private rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** Random Date between two dates (inclusive) */
  private randDate(from: Date, to: Date): Date {
    const ms = from.getTime() + Math.random() * (to.getTime() - from.getTime());
    return new Date(Math.floor(ms));
  }

  /* ───── clear ───── */

  async clearAll() {
    this.logger.warn('🗑  Clearing ALL collections…');
    await Promise.all([
      this.userModel.deleteMany({}),
      this.propertyModel.deleteMany({}),
      this.roomModel.deleteMany({}),
      this.tenantModel.deleteMany({}),
      this.contractModel.deleteMany({}),
      this.billModel.deleteMany({}),
      this.paymentModel.deleteMany({}),
      this.refreshTokenModel.deleteMany({}),
      this.subscriptionModel.deleteMany({}),
    ]);
    this.logger.log('All collections cleared');
    return { message: 'All data cleared' };
  }

  /* ───── seed ───── */

  async seed() {
    await this.clearAll();
    this.logger.log('🌱 Seeding demo data (Feb 2–20 2026)…');

    // ── Date ranges ──────────────────────────────────────────
    const FEB_2 = new Date('2026-02-02T07:00:00Z');
    const FEB_10 = new Date('2026-02-10T23:59:59Z');
    const FEB_11 = new Date('2026-02-11T07:00:00Z');
    const FEB_20 = new Date('2026-02-20T23:59:59Z');

    // ── 1. Owner ────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash('200406', 10);
    const ownerId = new Types.ObjectId();

    await this.userModel.create({
      _id: ownerId,
      email: 'py.quang.manh.ai@gmail.com',
      password: hashedPassword,
      fullName: 'Nhu Pham Quang Manh',
      phone: '+84372808558',
      role: Role.OWNER,
      ownerId: ownerId,
      isActive: true,
      isOnboardingComplete: true,
    });
    this.logger.log('  ✔ Owner: py.quang.manh.ai@gmail.com / 200406');

    // ── 1b. Subscription (Pro plan) ─────────────────────────
    const proLimits = PLAN_LIMITS[SubscriptionPlan.PRO];
    await this.subscriptionModel.create({
      ownerId,
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2025-12-01'),
      currentPeriodEnd: new Date('2026-12-01'),
      propertyLimit: proLimits.propertyLimit,
      roomLimit: proLimits.roomLimit,
      staffLimit: proLimits.staffLimit,
      features: proLimits.features,
    });
    this.logger.log('  ✔ Subscription: PRO plan (ai-agent enabled)');

    // ── 2. Property ─────────────────────────────────────────
    const property = await this.propertyModel.create({
      name: 'Nhà Trọ Bình An',
      address: '123 Nguyễn Trãi, Phường 2, Quận 5, TP.HCM',
      description: 'Nhà trọ cao cấp, đầy đủ tiện nghi, gần trung tâm',
      ownerId,
    });
    this.logger.log(`  ✔ Property: ${property.name}`);

    // ── 3. Rooms (10) ───────────────────────────────────────
    const roomMeta = [
      { name: 'Phòng 101', price: 3_000_000, area: 20 },
      { name: 'Phòng 102', price: 3_000_000, area: 20 },
      { name: 'Phòng 103', price: 3_500_000, area: 22 },
      { name: 'Phòng 201', price: 3_500_000, area: 22 },
      { name: 'Phòng 202', price: 4_000_000, area: 25 },
      { name: 'Phòng 203', price: 4_000_000, area: 25 },
      { name: 'Phòng 301', price: 4_500_000, area: 28 },
      { name: 'Phòng 302', price: 4_500_000, area: 28 },
      { name: 'Phòng 303', price: 5_000_000, area: 30 },
      { name: 'Phòng 304', price: 5_000_000, area: 30 },
    ];

    const rooms: RoomDocument[] = [];
    for (const m of roomMeta) {
      const floor = Math.ceil((roomMeta.indexOf(m) + 1) / 3);
      const room = await this.roomModel.create({
        name: m.name,
        price: m.price,
        area: m.area,
        status: RoomStatus.OCCUPIED,
        description: `${m.name} - ${m.area}m², tầng ${floor}`,
        propertyId: property._id,
        ownerId,
      });
      rooms.push(room);
    }
    this.logger.log(`  ✔ ${rooms.length} rooms created`);

    // ── 4. Tenants (10) ─────────────────────────────────────
    const tenantData = [
      { fullName: 'Trần Thị Bích', phone: '0912345001', idCard: '079200001001', email: 'bich.tran@email.com' },
      { fullName: 'Lê Văn Cường', phone: '0912345002', idCard: '079200001002', email: 'cuong.le@email.com' },
      { fullName: 'Phạm Thị Dung', phone: '0912345003', idCard: '079200001003', email: 'dung.pham@email.com' },
      { fullName: 'Hoàng Văn Em', phone: '0912345004', idCard: '079200001004', email: 'em.hoang@email.com' },
      { fullName: 'Ngô Thị Phương', phone: '0912345005', idCard: '079200001005', email: 'phuong.ngo@email.com' },
      { fullName: 'Vũ Văn Giang', phone: '0912345006', idCard: '079200001006', email: 'giang.vu@email.com' },
      { fullName: 'Đặng Thị Hà', phone: '0912345007', idCard: '079200001007', email: 'ha.dang@email.com' },
      { fullName: 'Bùi Văn Hùng', phone: '0912345008', idCard: '079200001008', email: 'hung.bui@email.com' },
      { fullName: 'Đỗ Thị Kim', phone: '0912345009', idCard: '079200001009', email: 'kim.do@email.com' },
      { fullName: 'Lý Văn Long', phone: '0912345010', idCard: '079200001010', email: 'long.ly@email.com' },
    ];
    const hometowns = ['Hà Nội', 'Đà Nẵng', 'Huế', 'Nghệ An', 'Thanh Hóa', 'Bình Dương', 'Long An', 'Cần Thơ'];

    const tenants: TenantDocument[] = [];
    for (const td of tenantData) {
      const tenant = await this.tenantModel.create({
        fullName: td.fullName,
        email: td.email,
        phone: td.phone,
        identityCard: td.idCard,
        address: `Quê quán: ${this.pick(hometowns)}`,
        dob: new Date(this.rand(1990, 2002), this.rand(0, 11), this.rand(1, 28)),
        ownerId,
      });
      tenants.push(tenant);
    }
    this.logger.log(`  ✔ ${tenants.length} tenants created`);

    // ── 5. Contracts (10 – started Dec 1 2025, 12 months) ──
    const contracts: ContractDocument[] = [];
    for (let i = 0; i < 10; i++) {
      const contract = await this.contractModel.create({
        roomId: rooms[i]._id,
        tenantId: tenants[i]._id,
        startDate: new Date('2025-12-01'),
        endDate: new Date('2026-12-01'),
        deposit: rooms[i].price,
        rentPrice: rooms[i].price,
        status: ContractStatus.ACTIVE,
        ownerId,
      });
      contracts.push(contract);
    }
    this.logger.log(`  ✔ ${contracts.length} contracts created`);

    // ── 6. Bills ────────────────────────────────────────────
    // 3 billing periods per room:
    //   • Dec 2025  — fully paid (payments in Dec 2025–Jan 2026)
    //   • Jan 2026  — mostly paid (payments Feb 2–10)
    //   • Feb 2026  — freshly issued (payments Feb 11–20, ~50% paid)
    const electricRate = 3_500;
    const waterRate = 20_000;

    const bills: BillDocument[] = [];

    type BillingPeriod = {
      month: number;
      year: number;
      billCreated: Date;
      payFrom: Date;
      payTo: Date;
      paidChance: number; // probability of PAID status
    };

    const periods: BillingPeriod[] = [
      {
        month: 12, year: 2025,
        billCreated: new Date('2025-12-05T08:00:00Z'),
        payFrom: new Date('2025-12-06T07:00:00Z'),
        payTo: new Date('2026-01-20T23:59:59Z'),
        paidChance: 0.9,
      },
      {
        month: 1, year: 2026,
        billCreated: new Date('2026-01-05T08:00:00Z'),
        payFrom: FEB_2,
        payTo: FEB_10,
        paidChance: 0.7,
      },
      {
        month: 2, year: 2026,
        billCreated: new Date('2026-02-05T08:00:00Z'),
        payFrom: FEB_11,
        payTo: FEB_20,
        paidChance: 0.5,
      },
    ];

    for (const contract of contracts) {
      let prevElectric = this.rand(100, 500);
      let prevWater = this.rand(10, 50);

      for (const period of periods) {
        const electricUsage = this.rand(50, 200);
        const waterUsage = this.rand(3, 15);

        const electricOld = prevElectric;
        const electricNew = prevElectric + electricUsage;
        const waterOld = prevWater;
        const waterNew = prevWater + waterUsage;

        const electricCost = electricUsage * electricRate;
        const waterCost = waterUsage * waterRate;
        const otherFee = this.pick([0, 0, 50_000, 100_000]);
        const totalAmount = contract.rentPrice + electricCost + waterCost + otherFee;

        const roll = Math.random();
        let status: BillStatus;
        let paidAmount: number;

        if (roll < period.paidChance) {
          status = BillStatus.PAID;
          paidAmount = totalAmount;
        } else if (roll < period.paidChance + 0.2) {
          status = BillStatus.PARTIAL;
          paidAmount = Math.round(totalAmount * (0.3 + Math.random() * 0.4));
        } else {
          status = BillStatus.UNPAID;
          paidAmount = 0;
        }

        const bill = await this.billModel.create({
          contractId: contract._id,
          roomId: contract.roomId,
          month: period.month,
          year: period.year,
          electricOldIndex: electricOld,
          electricNewIndex: electricNew,
          electricRate,
          electricCost,
          waterOldIndex: waterOld,
          waterNewIndex: waterNew,
          waterRate,
          waterCost,
          roomPrice: contract.rentPrice,
          otherFee,
          totalAmount,
          paidAmount,
          status,
          ownerId,
        });

        // Back-date timestamps via $set (bypasses Mongoose auto-timestamp)
        await this.billModel.updateOne(
          { _id: bill._id },
          { $set: { createdAt: period.billCreated, updatedAt: period.billCreated } },
        );

        bills.push(bill);
        prevElectric = electricNew;
        prevWater = waterNew;
      }
    }
    this.logger.log(`  ✔ ${bills.length} bills created (Dec 2025, Jan 2026, Feb 2026)`);

    // ── 7. Payments (Feb 2–20 window for Jan & Feb bills) ──
    let paymentCount = 0;
    for (const bill of bills) {
      if (bill.paidAmount <= 0) continue;

      // Determine which period this bill belongs to
      const period = periods.find(
        (p) => p.month === bill.month && p.year === bill.year,
      )!;

      if (bill.status === BillStatus.PAID) {
        const paidAt = this.randDate(period.payFrom, period.payTo);
        const payment = await this.paymentModel.create({
          billId: bill._id,
          amount: bill.paidAmount,
          method: this.pick([PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.CASH]),
          note: `Thanh toán đủ tháng ${bill.month}/${bill.year}`,
          ownerId,
        });
        await this.paymentModel.updateOne(
          { _id: payment._id },
          { $set: { createdAt: paidAt, updatedAt: paidAt } },
        );
        paymentCount++;
      } else if (bill.status === BillStatus.PARTIAL) {
        const parts = this.rand(1, 2);
        let remaining = bill.paidAmount;

        for (let p = 0; p < parts; p++) {
          const amount =
            p === parts - 1
              ? remaining
              : Math.round(remaining * (0.4 + Math.random() * 0.3));
          if (amount <= 0) continue;
          remaining -= amount;

          const paidAt = this.randDate(period.payFrom, period.payTo);
          const payment = await this.paymentModel.create({
            billId: bill._id,
            amount,
            method: this.pick([PaymentMethod.CASH, PaymentMethod.TRANSFER]),
            note: `Thanh toán lần ${p + 1} tháng ${bill.month}/${bill.year}`,
            ownerId,
          });
          await this.paymentModel.updateOne(
            { _id: payment._id },
            { $set: { createdAt: paidAt, updatedAt: paidAt } },
          );
          paymentCount++;
        }
      }
    }
    this.logger.log(`  ✔ ${paymentCount} payments created`);

    // ── Summary ─────────────────────────────────────────────
    const summary = {
      message: 'Seed completed successfully',
      credentials: { email: 'py.quang.manh.ai@gmail.com', password: '200406' },
      counts: {
        users: 1,
        properties: 1,
        rooms: rooms.length,
        tenants: tenants.length,
        contracts: contracts.length,
        bills: bills.length,
        payments: paymentCount,
      },
    };

    this.logger.log(`🎉 Seed complete! ${JSON.stringify(summary.counts)}`);
    return summary;
  }
}
