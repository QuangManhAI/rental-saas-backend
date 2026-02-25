import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import PDFDocument = require('pdfkit');
import { PassThrough } from 'stream';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { Room, RoomDocument } from '../rooms/rooms.schema';
import { UserPayload } from '../../shared/types';
import { BankAccountsService } from '../bank-accounts/bank-accounts.service';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Contract.name) private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    private readonly bankAccountsService: BankAccountsService,
  ) {}

  async generateInvoicePdf(billId: string, user: UserPayload): Promise<StreamableFile> {
    const ownerId = user.ownerId;

    // Load bill
    const bill = await this.billModel
      .findOne({ _id: new Types.ObjectId(billId), ownerId: new Types.ObjectId(ownerId), isDeleted: { $ne: true } })
      .lean()
      .exec();
    if (!bill) throw new NotFoundException('Bill not found');

    // Load contract → tenant + room
    const contract = await this.contractModel
      .findById(bill.contractId)
      .lean()
      .exec();

    const [tenant, room] = await Promise.all([
      contract ? this.tenantModel.findById(contract.tenantId).lean().exec() : null,
      this.roomModel.findById(bill.roomId).lean().exec(),
    ]);

    // Try to get QR code (non-blocking)
    let qrDataUrl: string | null = null;
    try {
      const qrResult = await this.bankAccountsService.generateBillQr(billId, ownerId);
      qrDataUrl = qrResult.qrDataUrl;
    } catch {
      // No bank account configured — skip QR
    }

    // Build PDF
    const stream = new PassThrough();
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    doc.pipe(stream);

    this.renderInvoice(doc, bill as any, contract as any, tenant as any, room as any, qrDataUrl);

    doc.end();

    return new StreamableFile(stream, {
      type: 'application/pdf',
      disposition: `attachment; filename="invoice-${bill.month}-${bill.year}.pdf"`,
    });
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  }

  private renderInvoice(
    doc: PDFKit.PDFDocument,
    bill: any,
    contract: any,
    tenant: any,
    room: any,
    qrDataUrl: string | null,
  ): void {
    const pageWidth = doc.page.width - 100; // margins

    // ── Header ────────────────────────────────────────────────────────────────
    doc.fontSize(22).font('Helvetica-Bold').text('HOA DON TIEN PHONG', 50, 50, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Thang ${bill.month}/${bill.year}`, { align: 'center' });
    doc.moveDown(0.5);

    doc
      .strokeColor('#4F46E5')
      .lineWidth(2)
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .stroke();
    doc.moveDown(1);

    // ── Tenant & Room info ────────────────────────────────────────────────────
    const infoY = doc.y;
    doc.fontSize(10).font('Helvetica-Bold').text('THONG TIN KHACH THUE:', 50, infoY);
    doc.font('Helvetica').text(`Ho ten: ${tenant?.fullName ?? 'N/A'}`, 50);
    if (tenant?.phone) doc.text(`So dien thoai: ${tenant.phone}`);
    if (tenant?.identityCard) doc.text(`CCCD/CMND: ${tenant.identityCard}`);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').text('THONG TIN PHONG:');
    doc.font('Helvetica').text(`Phong: ${(room as any)?.name ?? bill.roomId?.toString()}`);
    if ((room as any)?.floor) doc.text(`Tang: ${(room as any).floor}`);
    doc.moveDown(1);

    // ── Bill breakdown table ──────────────────────────────────────────────────
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 320;
    const col3 = 450;

    // Table header
    doc
      .fillColor('#4F46E5')
      .rect(col1, tableTop, pageWidth, 22)
      .fill();

    doc
      .fillColor('#FFFFFF')
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('Khoan muc', col1 + 5, tableTop + 5)
      .text('Chi tiet', col2, tableTop + 5)
      .text('Thanh tien', col3, tableTop + 5);

    doc.fillColor('#000000');

    let rowY = tableTop + 24;
    const rows = [
      {
        label: 'Tien phong',
        detail: '',
        amount: bill.roomPrice,
      },
      {
        label: 'Tien dien',
        detail: `${bill.electricNewIndex - bill.electricOldIndex} kWh x ${this.formatCurrency(bill.electricRate)}`,
        amount: bill.electricCost,
      },
      {
        label: 'Tien nuoc',
        detail: `${bill.waterNewIndex - bill.waterOldIndex} m3 x ${this.formatCurrency(bill.waterRate)}`,
        amount: bill.waterCost,
      },
      ...(bill.otherFee > 0 ? [{ label: 'Phi khac', detail: '', amount: bill.otherFee }] : []),
    ];

    rows.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.fillColor('#F8F7FF').rect(col1, rowY, pageWidth, 20).fill();
        doc.fillColor('#000000');
      }
      doc.fontSize(10).font('Helvetica')
        .text(row.label, col1 + 5, rowY + 4)
        .text(row.detail, col2, rowY + 4)
        .text(this.formatCurrency(row.amount), col3, rowY + 4);
      rowY += 22;
    });

    // Divider
    doc.strokeColor('#4F46E5').lineWidth(1).moveTo(col1, rowY).lineTo(col1 + pageWidth, rowY).stroke();
    rowY += 8;

    // Total
    doc.fontSize(12).font('Helvetica-Bold').text('TONG CONG', col1 + 5, rowY);
    doc.text(this.formatCurrency(bill.totalAmount), col3, rowY);
    rowY += 20;

    if (bill.paidAmount > 0) {
      doc.fontSize(10).font('Helvetica').fillColor('#16A34A')
        .text(`Da thanh toan: ${this.formatCurrency(bill.paidAmount)}`, col1 + 5, rowY)
        .fillColor('#000000');
      rowY += 18;
      const remaining = bill.totalAmount - bill.paidAmount;
      if (remaining > 0) {
        doc.font('Helvetica-Bold').fillColor('#DC2626')
          .text(`Con lai: ${this.formatCurrency(remaining)}`, col1 + 5, rowY)
          .fillColor('#000000');
        rowY += 18;
      }
    }

    // ── Meter readings ────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    doc.fontSize(10).font('Helvetica-Bold').text('CHI SO DONG HO:');
    doc.font('Helvetica').text(
      `Dien: ${bill.electricOldIndex} → ${bill.electricNewIndex} kWh  |  ` +
      `Nuoc: ${bill.waterOldIndex} → ${bill.waterNewIndex} m3`,
    );

    // ── QR Code ───────────────────────────────────────────────────────────────
    if (qrDataUrl) {
      doc.moveDown(1.5);
      doc.fontSize(10).font('Helvetica-Bold').text('CHUYEN KHOAN NGAN HANG:');
      doc.moveDown(0.5);

      // QR data URL is base64 PNG — extract and embed
      const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      const imgBuffer = Buffer.from(base64Data, 'base64');
      doc.image(imgBuffer, 50, doc.y, { width: 120, height: 120 });
      doc.text('Quet ma QR de chuyen khoan', 180, doc.y - 60);
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 80;
    doc
      .strokeColor('#E5E7EB')
      .lineWidth(1)
      .moveTo(50, footerY)
      .lineTo(doc.page.width - 50, footerY)
      .stroke();

    doc
      .fillColor('#6B7280')
      .fontSize(9)
      .font('Helvetica')
      .text(`Hoa don duoc tao tu dong boi he thong Rental SaaS`, 50, footerY + 10, { align: 'center' });
  }
}
