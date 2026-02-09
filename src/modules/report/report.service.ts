import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as ExcelJS from 'exceljs';

import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { Property, PropertyDocument } from '../properties/properties.schema';
import { R2Service } from './r2.service';
import { TelegramService } from '../telegram/telegram.service';
import { UserPayload } from '../../shared/types';

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Property.name)
    private readonly propertyModel: Model<PropertyDocument>,
    private readonly r2Service: R2Service,
    private readonly telegramService: TelegramService,
  ) { }

  /* ─── helpers ─── */

  private vnd(amount: number): string {
    return new Intl.NumberFormat('vi-VN').format(amount);
  }

  private styleHeaderRow(row: ExcelJS.Row) {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    row.height = 24;
  }

  private styleDataCell(cell: ExcelJS.Cell) {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { vertical: 'middle' };
  }

  /* ─── Monthly Report ─── */

  async generateMonthlyExcelBuffer(month: number, year: number, user: UserPayload): Promise<Buffer> {
    if (!user.ownerId) {
      throw new BadRequestException('Invalid user: no ownerId');
    }
    const ownerId = new Types.ObjectId(user.ownerId);
    this.logger.log(`Generating monthly Excel buffer ${month}/${year}`);

    // Fetch bills for the month/year
    const bills = await this.billModel
      .find({ ownerId, month, year })
      .populate('contractId', 'tenantId')
      .populate('roomId', 'name')
      .lean();

    this.logger.log(`Found ${bills.length} bills for ${month}/${year}`);

    if (bills.length === 0) {
      throw new NotFoundException('No report data for this month');
    }

    // Fetch tenants for tenant names
    const tenantIds = bills
      .map((b) => (b.contractId as any)?.tenantId)
      .filter(Boolean);
    const tenants = await this.tenantModel
      .find({ _id: { $in: tenantIds } })
      .lean();
    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));

    // Fetch properties for header
    const properties = await this.propertyModel.find({ ownerId }).lean();

    // Build workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rental SaaS';
    wb.created = new Date();

    const ws = wb.addWorksheet(`Tháng ${month}-${year}`);

    // Title
    ws.mergeCells('A1:I1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `BÁO CÁO THU CHI THÁNG ${month}/${year}`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E40AF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Property info
    if (properties.length > 0) {
      ws.mergeCells('A2:I2');
      const propCell = ws.getCell('A2');
      propCell.value = `${properties[0].name} — ${properties[0].address}`;
      propCell.font = { italic: true, size: 11 };
      propCell.alignment = { horizontal: 'center' };
    }

    // Headers
    const headers = [
      'STT',
      'Phòng',
      'Khách thuê',
      'Tiền phòng',
      'Tiền điện',
      'Tiền nước',
      'Phí khác',
      'Tổng cộng',
      'Đã thu',
      'Còn lại',
      'Trạng thái',
    ];

    const headerRow = ws.addRow(headers);
    this.styleHeaderRow(headerRow);

    // Column widths
    ws.columns = [
      { width: 5 },
      { width: 14 },
      { width: 20 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
    ];

    // Data rows
    let totalRevenue = 0;
    let totalCollected = 0;

    bills.forEach((bill, idx) => {
      const room = bill.roomId as any;
      const contract = bill.contractId as any;
      const tenant = contract ? tenantMap.get(contract.tenantId.toString()) : null;

      totalRevenue += bill.totalAmount;
      totalCollected += bill.paidAmount;
      const remaining = bill.totalAmount - bill.paidAmount;

      const row = ws.addRow([
        idx + 1,
        room?.name || '—',
        tenant?.fullName || '—',
        bill.roomPrice,
        bill.electricCost,
        bill.waterCost,
        bill.otherFee,
        bill.totalAmount,
        bill.paidAmount,
        remaining,
        bill.status,
      ]);

      row.eachCell((cell) => this.styleDataCell(cell));

      // Number formatting for VND columns
      [4, 5, 6, 7, 8, 9].forEach((colIdx) => {
        const cell = row.getCell(colIdx);
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });

      // Status coloring
      const statusCell = row.getCell(11);
      statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (bill.status === 'PAID') {
        statusCell.font = { bold: true, color: { argb: 'FF16A34A' } };
      } else if (bill.status === 'UNPAID') {
        statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
      } else if (bill.status === 'PARTIAL') {
        statusCell.font = { bold: true, color: { argb: 'FFF59E0B' } };
      }
    });

    // Summary row
    ws.addRow([]);
    const sumRow = ws.addRow([
      '',
      '',
      'TỔNG CỘNG',
      '',
      '',
      '',
      '',
      totalRevenue,
      totalCollected,
      totalRevenue - totalCollected,
      '',
    ]);
    sumRow.font = { bold: true, size: 12 };
    [8, 9, 10].forEach((col) => {
      sumRow.getCell(col).numFmt = '#,##0';
    });
    sumRow.eachCell((cell) => this.styleDataCell(cell));

    // Export to buffer
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /* ─── Revenue Report (yearly) ─── */

  async generateRevenueReport(year: number, user: UserPayload) {
    if (!user.ownerId) {
      throw new BadRequestException('Invalid user: no ownerId');
    }
    const ownerId = new Types.ObjectId(user.ownerId);
    this.logger.log(`Generating revenue report for ${year}`);

    const bills = await this.billModel.find({ ownerId, year }).lean();

    this.logger.log(`Found ${bills.length} bills for year ${year}`);

    if (bills.length === 0) {
      throw new BadRequestException('No report data for this year');
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rental SaaS';
    const ws = wb.addWorksheet(`Doanh thu ${year}`);

    // Title
    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `BÁO CÁO DOANH THU NĂM ${year}`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E40AF' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 36;

    // Headers
    const headerRow = ws.addRow([
      'Tháng',
      'Số hóa đơn',
      'Tổng doanh thu',
      'Đã thu',
      'Công nợ',
    ]);
    this.styleHeaderRow(headerRow);
    ws.columns = [
      { width: 12 },
      { width: 14 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
    ];

    let grandTotal = 0;
    let grandCollected = 0;

    for (let m = 1; m <= 12; m++) {
      const monthBills = bills.filter((b) => b.month === m);
      const revenue = monthBills.reduce((s, b) => s + b.totalAmount, 0);
      const collected = monthBills.reduce((s, b) => s + b.paidAmount, 0);

      grandTotal += revenue;
      grandCollected += collected;

      const row = ws.addRow([
        `Tháng ${m}`,
        monthBills.length,
        revenue,
        collected,
        revenue - collected,
      ]);
      row.eachCell((cell) => this.styleDataCell(cell));
      [3, 4, 5].forEach((col) => {
        row.getCell(col).numFmt = '#,##0';
        row.getCell(col).alignment = {
          horizontal: 'right',
          vertical: 'middle',
        };
      });
    }

    // Grand total
    ws.addRow([]);
    const sumRow = ws.addRow([
      'TỔNG NĂM',
      bills.length,
      grandTotal,
      grandCollected,
      grandTotal - grandCollected,
    ]);
    sumRow.font = { bold: true, size: 12 };
    [3, 4, 5].forEach((col) => {
      sumRow.getCell(col).numFmt = '#,##0';
    });
    sumRow.eachCell((cell) => this.styleDataCell(cell));

    // Export
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const filename = `revenue_${year}.xlsx`;
    const key = `reports/${user.ownerId}/${filename}`;

    const result = await this.r2Service.upload(
      key,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    return {
      message: `Revenue report ${year} generated`,
      filename,
      ...result,
      summary: {
        totalBills: bills.length,
        grandTotal,
        grandCollected,
        grandDebt: grandTotal - grandCollected,
      },
    };
  }

  /* ─── Generate + Send to Telegram ─── */

  async sendMonthlyToTelegram(month: number, year: number, user: UserPayload) {
    if (!user.ownerId) {
      throw new BadRequestException('Invalid user: no ownerId');
    }

    this.logger.log(`Sending monthly report ${month}/${year} to owner ${user.ownerId}`);

    // Check if owner has linked Telegram
    const isLinked = await this.telegramService.isOwnerLinked(user.ownerId);
    if (!isLinked) {
      throw new BadRequestException('Bạn chưa liên kết Telegram. Vui lòng liên kết trước khi gửi báo cáo.');
    }

    // Generate Excel buffer
    const buffer = await this.generateMonthlyExcelBuffer(month, year, user);
    const filename = `report_${year}_${String(month).padStart(2, '0')}.xlsx`;
    const caption = `📊 Báo cáo thu chi tháng ${month}/${year}`;

    // Send to owner
    const result = await this.telegramService.sendDocumentToOwner(
      user.ownerId,
      buffer,
      filename,
      caption,
    );

    return {
      message: `Đã gửi báo cáo tháng ${month}/${year} qua Telegram`,
      filename,
      telegram: { ok: result.ok },
    };
  }

  async sendRevenueToTelegram(year: number, user: UserPayload) {
    if (!user.ownerId) {
      throw new BadRequestException('Invalid user: no ownerId');
    }

    // Check if owner has linked Telegram
    const isLinked = await this.telegramService.isOwnerLinked(user.ownerId);
    if (!isLinked) {
      throw new BadRequestException('Bạn chưa liên kết Telegram. Vui lòng liên kết trước khi gửi báo cáo.');
    }

    const report = await this.generateRevenueReport(year, user);

    const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
    let msg = `📊 <b>BÁO CÁO DOANH THU NĂM ${year}</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📋 Tổng hóa đơn: <b>${report.summary.totalBills}</b>\n`;
    msg += `💰 Tổng doanh thu: <b>${vnd(report.summary.grandTotal)} VNĐ</b>\n`;
    msg += `✅ Đã thu: <b>${vnd(report.summary.grandCollected)} VNĐ</b>\n`;
    msg += `⚠️ Công nợ: <b>${vnd(report.summary.grandDebt)} VNĐ</b>\n`;
    if (report.url) {
      msg += `\n📎 <a href="${report.url}">Tải file Excel</a>`;
    }
    msg += `\n━━━━━━━━━━━━━━━━━━━━`;

    // Send to owner
    const telegramResult = await this.telegramService.sendMessageToOwner(
      user.ownerId,
      msg,
    );

    return {
      ...report,
      telegram: telegramResult,
    };
  }

  async generateTenantMonthlyExcelBuffer(
    tenantId: string,
    month: number,
    year: number,
    user: UserPayload,
  ): Promise<Buffer> {
    // Generate a basic Excel report for the tenant
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Rental SaaS';
    wb.created = new Date();

    const ws = wb.addWorksheet(`Report ${month}-${year}`);

    ws.addRow(['Tenant ID', tenantId]);
    ws.addRow(['Month', month]);
    ws.addRow(['Year', year]);
    ws.addRow(['Report', 'Monthly Report for Tenant']);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}

