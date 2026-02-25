import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { User, UserDocument } from '../users/users.schema';
import { TelegramService } from '../telegram/telegram.service';
import { MomoService } from '../momo/momo.service';
import { BillStatus } from '../bills/enums/bill-status.enum';
import { ContractStatus } from '../contracts/enums/contract-status.enum';
import { SubscriptionService } from '../subscription/subscription.service';

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
    private readonly momoService: MomoService,
    private readonly subscriptionService: SubscriptionService,
  ) { }

  /* ──────────────────────────────────────────────────────────
   * 0. Subscription expiry check
   *    Runs daily at 1:00 AM
   * ────────────────────────────────────────────────────────── */
  @Cron('0 1 * * *', { name: 'subscription-expiry-check' })
  async checkSubscriptionExpiry() {
    this.logger.log('⏰ Running subscription expiry check…');
    const expired = await this.subscriptionService.expireOverdueSubscriptions();
    if (expired > 0) {
      this.logger.warn(`⚠️ ${expired} subscription(s) expired and downgraded to free`);
    }
  }

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

  /* ──────────────────────────────────────────────────────────
   * 3. Monthly Bill Generation & Tenant Notification
   *    Runs on the 1st of every month at 9:00 AM
   *    Creates bills for all active contracts, sends Telegram notifications
   * ────────────────────────────────────────────────────────── */

  @Cron('0 9 1 * *', { name: 'monthly-bill-generation' })
  async generateMonthlyBillsAndNotify() {
    this.logger.log('⏰ Running monthly bill generation...');

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get all active contracts
    const activeContracts = await this.contractModel
      .find({ status: ContractStatus.ACTIVE })
      .lean();

    if (activeContracts.length === 0) {
      this.logger.log('No active contracts found');
      return { message: 'No active contracts', billsCreated: 0 };
    }

    const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    let billsCreated = 0;
    let tenantsNotified = 0;

    for (const contract of activeContracts) {
      try {
        // Check if bill already exists for this month
        const existingBill = await this.billModel.findOne({
          contractId: contract._id,
          month: currentMonth,
          year: currentYear,
        });

        if (existingBill) {
          this.logger.log(`Bill already exists for contract ${contract._id} in ${currentMonth}/${currentYear}`);
          continue;
        }

        // Get room for pricing
        const room = await this.roomModel.findById(contract.roomId).lean();
        if (!room) continue;

        // Create bill with default values (owner can update meter readings later)
        const newBill = await this.billModel.create({
          contractId: contract._id,
          roomId: contract.roomId,
          month: currentMonth,
          year: currentYear,
          electricOldIndex: 0,
          electricNewIndex: 0,
          electricRate: 3500, // Default rate
          electricCost: 0,
          waterOldIndex: 0,
          waterNewIndex: 0,
          waterRate: 20000, // Default rate
          waterCost: 0,
          roomPrice: contract.rentPrice,
          otherFee: 0,
          totalAmount: contract.rentPrice, // Base rent, owner updates utilities later
          paidAmount: 0,
          status: BillStatus.UNPAID,
          ownerId: contract.ownerId,
        });

        billsCreated++;
        this.logger.log(`Bill created: ${newBill._id} for contract ${contract._id}`);

        // Notify tenant via Telegram
        const tenant = await this.tenantModel.findById(contract.tenantId);
        if (tenant?.telegramChatId) {
          // Generate MoMo payment link
          let payUrl = null;
          let payment: any = null;
          try {
            payment = await this.momoService.createPayment(
              newBill._id.toString(),
              { ownerId: contract.ownerId.toString() } as any, // Mock user payload
            );
            payUrl = payment.payUrl;
          } catch (e: any) {
            this.logger.warn(`Could not generate MoMo link for bill ${newBill._id}: ${e.message}`);
          }

          let msg = `📋 <b>THÔNG BÁO HOÁ ĐƠN THÁNG ${currentMonth}/${currentYear}</b>\n`;
          msg += `━━━━━━━━━━━━━━━━━━━━\n`;
          msg += `🏠 Phòng: ${room.name}\n`;
          msg += `💰 Tiền phòng: ${vnd(contract.rentPrice)} VNĐ\n`;
          msg += `📝 <i>(Tiền điện/nước sẽ được cập nhật)</i>\n\n`;

          if (payUrl) {
            msg += `👉 Link thanh toán MoMo:\n${payUrl}\n`;
            if (payment.deeplink) msg += `🔗 Mở App MoMo:\n${payment.deeplink}\n`;
            if (payment.qrCodeUrl) msg += `📷 QR Code:\n${payment.qrCodeUrl}\n`;
          } else {
            msg += `⚠️ Không thể tạo link thanh toán MoMo.\n\n`;
          }

          // msg += `👉 Link hoá đơn:\n${frontendUrl}/payment/${newBill._id}\n\n`; // Removed as per request

          msg += `⏰ Vui lòng thanh toán trước ngày 5.\n`;
          msg += `━━━━━━━━━━━━━━━━━━━━`;

          try {
            await this.telegramService.sendMessageToTenant(
              contract.tenantId.toString(),
              msg,
            );
            tenantsNotified++;
          } catch (err: any) {
            this.logger.warn(`Could not notify tenant ${contract.tenantId}: ${err.message}`);
          }
        }
      } catch (err: any) {
        this.logger.error(`Error processing contract ${contract._id}: ${err.message}`);
      }
    }

    this.logger.log(`✅ Monthly bill generation done: ${billsCreated} bills created, ${tenantsNotified} tenants notified`);

    return {
      message: 'Monthly bill generation completed',
      billsCreated,
      tenantsNotified,
      month: currentMonth,
      year: currentYear,
    };
  }

  /* ──────────────────────────────────────────────────────────
   * 4. MongoDB Backup to R2
   *    Runs every day at 2:00 AM
   *    Executes backup-mongodb.sh and notifies admin via Telegram
   * ────────────────────────────────────────────────────────── */

  @Cron('0 2 * * *', { name: 'mongodb-backup' })
  async runMongoBackup() {
    this.logger.log('⏰ Running MongoDB backup...');

    const adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID || '';
    const scriptPath = path.resolve(process.cwd(), 'scripts/backup-mongodb.sh');
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`, {
        timeout: 5 * 60 * 1000, // 5-minute timeout
        env: { ...process.env },
      });

      if (stderr) this.logger.warn(`Backup stderr: ${stderr}`);

      const duration = Math.round((Date.now() - startTime) / 1000);

      // Parse output for details
      const nameMatch = stdout.match(/BACKUP_NAME=(.+)/);
      const sizeMatch = stdout.match(/ARCHIVE_SIZE=(.+)/);
      const backupName = nameMatch?.[1]?.trim() ?? 'unknown';
      const archiveSize = sizeMatch?.[1]?.trim() ?? 'unknown';

      this.logger.log(`✅ Backup complete: ${backupName} (${archiveSize}) in ${duration}s`);

      if (adminChatId) {
        const msg =
          `✅ <b>BACKUP THÀNH CÔNG</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `📦 File: ${backupName}.tar.gz\n` +
          `📊 Size: ${archiveSize}\n` +
          `⏱ Duration: ${duration}s\n` +
          `🕐 ${new Date().toLocaleString('vi-VN')}`;
        await this.telegramService.sendMessage(adminChatId, msg);
      }
    } catch (err: any) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      this.logger.error(`Backup failed after ${duration}s: ${err.message}`);

      if (adminChatId) {
        const msg =
          `❌ <b>BACKUP THẤT BẠI</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `💥 Lỗi: ${err.message?.slice(0, 300)}\n` +
          `⏱ Sau: ${duration}s\n` +
          `🕐 ${new Date().toLocaleString('vi-VN')}`;
        try {
          await this.telegramService.sendMessage(adminChatId, msg);
        } catch { /* ignore notification failure */ }
      }
    }
  }
}
