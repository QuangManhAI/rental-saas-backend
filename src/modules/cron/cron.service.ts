import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { User, UserDocument } from '../users/users.schema';
import { TelegramService } from '../telegram/telegram.service';
import { BillStatus } from '../bills/enums/bill-status.enum';
import { ContractStatus } from '../contracts/enums/contract-status.enum';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly telegramService: TelegramService,
  ) { }

  /* ──────────────────────────────────────────────────────────
   * 1. Overdue Bills Check
   *    Runs on the 1st of every month at 8:00 AM
   * ────────────────────────────────────────────────────────── */

  @Cron('0 8 1 * *', { name: 'overdue-bills-check' })
  async checkOverdueBills() {
    this.logger.log('⏰ Running overdue bills check…');

    // Find all UNPAID and PARTIAL bills
    const overdueBills = await this.billModel
      .find({ status: { $in: [BillStatus.UNPAID, BillStatus.PARTIAL] } })
      .lean();

    if (overdueBills.length === 0) {
      this.logger.log('No overdue bills found');
      return { message: 'No overdue bills', count: 0 };
    }

    // Group by ownerId
    const ownerBillsMap = new Map<string, typeof overdueBills>();
    for (const bill of overdueBills) {
      const key = bill.ownerId.toString();
      if (!ownerBillsMap.has(key)) ownerBillsMap.set(key, []);
      ownerBillsMap.get(key)!.push(bill);
    }

    // Fetch rooms and contracts for context
    const roomIds = [...new Set(overdueBills.map((b) => b.roomId.toString()))];
    const contractIds = [
      ...new Set(overdueBills.map((b) => b.contractId.toString())),
    ];

    const [rooms, contracts, tenants] = await Promise.all([
      this.roomModel
        .find({ _id: { $in: roomIds.map((id) => new Types.ObjectId(id)) } })
        .lean(),
      this.contractModel
        .find({
          _id: { $in: contractIds.map((id) => new Types.ObjectId(id)) },
        })
        .lean(),
      this.tenantModel.find({}).lean(),
    ]);

    const roomMap = new Map(rooms.map((r) => [r._id.toString(), r]));
    const contractMap = new Map(contracts.map((c) => [c._id.toString(), c]));
    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));

    // Format VND
    const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

    // Send notification per owner
    let notifiedCount = 0;
    for (const [, bills] of ownerBillsMap) {
      const totalDebt = bills.reduce(
        (s, b) => s + (b.totalAmount - b.paidAmount),
        0,
      );

      let msg = `🔴 <b>THÔNG BÁO HÓA ĐƠN QUÁ HẠN</b>\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `Tổng hóa đơn nợ: <b>${bills.length}</b>\n`;
      msg += `Tổng công nợ: <b>${vnd(totalDebt)} VNĐ</b>\n\n`;

      // Detail (max 15 bills to avoid message too long)
      const displayBills = bills.slice(0, 15);
      for (const bill of displayBills) {
        const room = roomMap.get(bill.roomId.toString());
        const contract = contractMap.get(bill.contractId.toString());
        const tenant = contract
          ? tenantMap.get(contract.tenantId.toString())
          : null;

        const debt = bill.totalAmount - bill.paidAmount;
        msg += `📌 <b>${room?.name || 'Phòng ?'}</b> — T${bill.month}/${bill.year}\n`;
        msg += `   👤 ${tenant?.fullName || '—'}\n`;
        msg += `   💰 Nợ: ${vnd(debt)} VNĐ (${bill.status})\n\n`;
      }

      if (bills.length > 15) {
        msg += `… và ${bills.length - 15} hóa đơn khác\n`;
      }

      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `🕐 ${new Date().toLocaleString('vi-VN')}`;

      // Send to owner
      const ownerId = bills[0].ownerId.toString();
      try {
        await this.telegramService.sendMessageToOwner(ownerId, msg);
      } catch (err: any) {
        this.logger.warn(`Could not notify owner ${ownerId}: ${err.message}`);
      }
      notifiedCount++;
    }

    this.logger.log(
      `✅ Overdue check done: ${overdueBills.length} bills, ${notifiedCount} owners notified`,
    );

    return {
      message: 'Overdue check completed',
      overdueBills: overdueBills.length,
      ownersNotified: notifiedCount,
    };
  }

  /* ──────────────────────────────────────────────────────────
   * 2. Contract Expiry Check
   *    Runs every day at 9:00 AM — warns about contracts
   *    expiring within the next 30 days.
   * ────────────────────────────────────────────────────────── */

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'contract-expiry-check' })
  async checkExpiringContracts() {
    this.logger.log('⏰ Running contract expiry check…');

    const now = new Date();
    const thirtyDaysLater = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const expiringContracts = await this.contractModel
      .find({
        status: ContractStatus.ACTIVE,
        endDate: { $gte: now, $lte: thirtyDaysLater },
      })
      .lean();

    if (expiringContracts.length === 0) {
      this.logger.log('No expiring contracts found');
      return { message: 'No expiring contracts', count: 0 };
    }

    // Fetch context
    const roomIds = expiringContracts.map((c) => c.roomId);
    const tenantIds = expiringContracts.map((c) => c.tenantId);

    const [rooms, tenants] = await Promise.all([
      this.roomModel.find({ _id: { $in: roomIds } }).lean(),
      this.tenantModel.find({ _id: { $in: tenantIds } }).lean(),
    ]);

    const roomMap = new Map(rooms.map((r) => [r._id.toString(), r]));
    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));

    const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);

    let msg = `⚠️ <b>HỢP ĐỒNG SẮP HẾT HẠN</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Số hợp đồng: <b>${expiringContracts.length}</b>\n\n`;

    for (const contract of expiringContracts) {
      const room = roomMap.get(contract.roomId.toString());
      const tenant = tenantMap.get(contract.tenantId.toString());
      const daysLeft = Math.ceil(
        (contract.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      msg += `📋 <b>${room?.name || 'Phòng ?'}</b>\n`;
      msg += `   👤 ${tenant?.fullName || '—'}\n`;
      msg += `   💰 ${vnd(contract.rentPrice)} VNĐ/tháng\n`;
      msg += `   📅 Hết hạn: ${contract.endDate.toLocaleDateString('vi-VN')}`;
      msg += ` (<b>${daysLeft} ngày</b>)\n\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🕐 ${now.toLocaleString('vi-VN')}`;

    // Send to owners who have expiring contracts
    const ownerIds = [...new Set(expiringContracts.map((c) => c.ownerId.toString()))];
    for (const ownerId of ownerIds) {
      try {
        await this.telegramService.sendMessageToOwner(ownerId, msg);
      } catch (err: any) {
        this.logger.warn(`Could not notify owner ${ownerId}: ${err.message}`);
      }
    }

    this.logger.log(
      `✅ Expiry check done: ${expiringContracts.length} contracts expiring`,
    );

    return {
      message: 'Contract expiry check completed',
      expiringContracts: expiringContracts.length,
    };
  }
}
