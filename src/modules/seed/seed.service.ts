import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { User, UserDocument } from '../users/users.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { RefreshToken } from '../auth/auth.schema';

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
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<any>,
  ) {}

  /* ───── helpers ───── */

  private rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ───── clear ───── */

  async clearAll() {
    this.logger.warn('🗑  Clearing ALL collections…');
    await Promise.all([
      this.userModel.deleteMany({}),
      this.propertyModel.deleteMany({}),
      this.roomModel.deleteMany({}),
      this.tenantModel.deleteMany({}),
      this.customerModel.deleteMany({}),
      this.contractModel.deleteMany({}),
      this.billModel.deleteMany({}),
      this.paymentModel.deleteMany({}),
      this.refreshTokenModel.deleteMany({}),
    ]);
    this.logger.log('All collections cleared');
    return { message: 'All data cleared' };
  }

  /* ───── seed ───── */

  async seed() {
    await this.clearAll();
    this.logger.log(' Seeding demo data…');

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
      ownerId: ownerId, // owner's ownerId points to themselves
      isActive: true,
    });
    this.logger.log(`  ✔ Owner created: py.quang.manh.ai@gmail.com / 200406`);

    // ── 2. Property ─────────────────────────────────────────
    const property = await this.propertyModel.create({
      name: 'Nhà Trọ Bình An',
      address: '123 Nguyễn Trãi, Phường 2, Quận 5, TP.HCM',
      description: 'Nhà trọ cao cấp, đầy đủ tiện nghi, gần trung tâm',
      ownerId,
    });
    this.logger.log(`  ✔ Property: ${property.name}`);

    // ── 3. Rooms (10) ───────────────────────────────────────
    const roomNames = [
      'Phòng 101',
      'Phòng 102',
      'Phòng 103',
      'Phòng 201',
      'Phòng 202',
      'Phòng 203',
      'Phòng 301',
      'Phòng 302',
      'Phòng 303',
      'Phòng 304',
    ];
    const roomPrices = [
      3_000_000, 3_000_000, 3_500_000, 3_500_000, 4_000_000,
      4_000_000, 4_500_000, 4_500_000, 5_000_000, 5_000_000,
    ];
    const roomAreas = [20, 20, 22, 22, 25, 25, 28, 28, 30, 30];

    const rooms: RoomDocument[] = [];
    for (let i = 0; i < 10; i++) {
      const room = await this.roomModel.create({
        name: roomNames[i],
        price: roomPrices[i],
        area: roomAreas[i],
        status: RoomStatus.OCCUPIED, // will be occupied by contracts
        description: `${roomNames[i]} - ${roomAreas[i]}m², tầng ${Math.ceil((i + 1) / 3)}`,
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

    const tenants: TenantDocument[] = [];
    for (const td of tenantData) {
      const tenant = await this.tenantModel.create({
        fullName: td.fullName,
        email: td.email,
        phone: td.phone,
        identityCard: td.idCard,
        address: `Quê quán: ${this.pick(['Hà Nội', 'Đà Nẵng', 'Huế', 'Nghệ An', 'Thanh Hóa', 'Bình Dương', 'Long An', 'Cần Thơ'])}`,
        dob: new Date(
          this.rand(1990, 2002),
          this.rand(0, 11),
          this.rand(1, 28),
        ),
        ownerId,
      });
      tenants.push(tenant);
    }
    this.logger.log(`  ✔ ${tenants.length} tenants created`);

    // ── 4.5. Customers (5) ───────────────────────────────────
    const customerData = [
      { name: 'Nguyễn Văn A', email: 'nguyenvana@gmail.com' },
      { name: 'Trần Thị B', email: 'tranthib@gmail.com' },
      { name: 'Lê Văn C', email: 'levanc@gmail.com' },
      { name: 'Phạm Thị D', email: 'phamthid@gmail.com' },
      { name: 'Hoàng Văn E', email: 'hoangvane@gmail.com' },
    ];

    const customers: CustomerDocument[] = [];
    for (const cd of customerData) {
      const customer = await this.customerModel.create({
        name: cd.name,
        email: cd.email,
        ownerId,
      });
      customers.push(customer);
    }
    this.logger.log(`  ✔ ${customers.length} customers created`);

    // ── 5. Contracts (10 – one per room) ────────────────────
    const contracts: ContractDocument[] = [];
    for (let i = 0; i < 10; i++) {
      const startDate = new Date(2024, 0, 1); // Jan 1 2024
      const endDate = new Date(2025, 0, 1); // Jan 1 2025
      const contract = await this.contractModel.create({
        roomId: rooms[i]._id,
        tenantId: tenants[i]._id,
        startDate,
        endDate,
        deposit: rooms[i].price, // 1 month deposit
        rentPrice: rooms[i].price,
        status: ContractStatus.ACTIVE,
        ownerId,
      });
      contracts.push(contract);
    }
    this.logger.log(`  ✔ ${contracts.length} contracts created`);

    // ── 6. Bills (12 months × 10 rooms = 120 bills) ────────
    const bills: BillDocument[] = [];
    const electricRate = 3_500; // VND per kWh
    const waterRate = 20_000; // VND per m³

    for (const contract of contracts) {
      let prevElectric = this.rand(100, 500);
      let prevWater = this.rand(10, 50);

      for (let month = 1; month <= 12; month++) {
        const electricUsage = this.rand(50, 200); // kWh
        const waterUsage = this.rand(3, 15); // m³

        const electricOld = prevElectric;
        const electricNew = prevElectric + electricUsage;
        const waterOld = prevWater;
        const waterNew = prevWater + waterUsage;

        const electricCost = electricUsage * electricRate;
        const waterCost = waterUsage * waterRate;
        const otherFee = this.pick([0, 0, 50_000, 100_000]); // random other fees
        const totalAmount =
          contract.rentPrice + electricCost + waterCost + otherFee;

        // Random payment status
        const statusRoll = Math.random();
        let status: BillStatus;
        let paidAmount: number;

        if (month <= 9) {
          // Older months: mostly paid
          if (statusRoll < 0.8) {
            status = BillStatus.PAID;
            paidAmount = totalAmount;
          } else if (statusRoll < 0.95) {
            status = BillStatus.PARTIAL;
            paidAmount = Math.round(totalAmount * (0.3 + Math.random() * 0.5));
          } else {
            status = BillStatus.UNPAID;
            paidAmount = 0;
          }
        } else {
          // Recent months (Oct-Dec): mix of statuses
          if (statusRoll < 0.4) {
            status = BillStatus.PAID;
            paidAmount = totalAmount;
          } else if (statusRoll < 0.7) {
            status = BillStatus.PARTIAL;
            paidAmount = Math.round(totalAmount * (0.2 + Math.random() * 0.5));
          } else {
            status = BillStatus.UNPAID;
            paidAmount = 0;
          }
        }

        const bill = await this.billModel.create({
          contractId: contract._id,
          roomId: contract.roomId,
          month,
          year: 2024,
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

        bills.push(bill);
        prevElectric = electricNew;
        prevWater = waterNew;
      }
    }
    this.logger.log(`  ✔ ${bills.length} bills created`);

    // ── 7. Payments (for bills that have paidAmount > 0) ────
    let paymentCount = 0;
    for (const bill of bills) {
      if (bill.paidAmount <= 0) continue;

      if (bill.status === BillStatus.PAID) {
        // Single full payment
        await this.paymentModel.create({
          billId: bill._id,
          amount: bill.paidAmount,
          method: this.pick([
            PaymentMethod.CASH,
            PaymentMethod.TRANSFER,
            PaymentMethod.CASH,
          ]),
          note: `Thanh toán đủ tháng ${bill.month}/2024`,
          ownerId,
        });
        paymentCount++;
      } else if (bill.status === BillStatus.PARTIAL) {
        // 1–2 partial payments
        const parts = this.rand(1, 2);
        let remaining = bill.paidAmount;

        for (let p = 0; p < parts; p++) {
          const amount =
            p === parts - 1
              ? remaining
              : Math.round(remaining * (0.4 + Math.random() * 0.3));
          if (amount <= 0) continue;
          remaining -= amount;

          await this.paymentModel.create({
            billId: bill._id,
            amount,
            method: this.pick([PaymentMethod.CASH, PaymentMethod.TRANSFER]),
            note: `Thanh toán lần ${p + 1} tháng ${bill.month}/2024`,
            ownerId,
          });
          paymentCount++;
        }
      }
    }
    this.logger.log(`  ✔ ${paymentCount} payments created`);

    // ── Summary ─────────────────────────────────────────────
    const summary = {
      message: 'Seed completed successfully',
      credentials: { email: 'py@gmail.com', password: '200406' },
      counts: {
        users: 1,
        properties: 1,
        rooms: rooms.length,
        tenants: tenants.length,
        customers: customers.length,
        contracts: contracts.length,
        bills: bills.length,
        payments: paymentCount,
      },
    };

    this.logger.log(` Seed complete! ${JSON.stringify(summary.counts)}`);
    return summary;
  }
}
