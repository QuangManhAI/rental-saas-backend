import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Payment, PaymentDocument } from './payments.schema';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserPayload } from '../../shared/types';
import { BillStatus } from '../bills/enums/bill-status.enum';
import { MailService } from '../mail/mail.service';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Bill.name)
    private readonly billModel: Model<BillDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly mailService: MailService,
  ) { }

  /**
   * Create a payment and auto-update the bill status.
   * Uses a transaction to ensure consistency.
   */
  async create(
    dto: CreatePaymentDto,
    user: UserPayload,
  ): Promise<PaymentDocument> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ownerObjectId = new Types.ObjectId(user.ownerId);
      const billObjectId = new Types.ObjectId(dto.billId);

      // 1. Validate bill
      const bill = await this.billModel
        .findOne({ _id: billObjectId, ownerId: ownerObjectId })
        .session(session);

      if (!bill) {
        throw new NotFoundException('Bill not found or access denied');
      }

      if (bill.status === BillStatus.PAID) {
        throw new BadRequestException('Bill is already fully paid');
      }

      // Prevent overpayment
      const remaining = bill.totalAmount - bill.paidAmount;
      if (dto.amount > remaining) {
        throw new BadRequestException(
          `Payment amount (${dto.amount}) exceeds remaining balance (${remaining})`,
        );
      }

      // 2. Create payment
      const [payment] = await this.paymentModel.create(
        [
          {
            billId: billObjectId,
            amount: dto.amount,
            method: dto.method,
            note: dto.note,
            ownerId: ownerObjectId,
          },
        ],
        { session },
      );

      // 3. Sum all non-deleted payments for this bill
      const result = await this.paymentModel.aggregate([
        { $match: { billId: billObjectId, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).session(session);

      const totalPaid = result.length > 0 ? (result[0].total as number) : 0;

      // 4. Update bill paid amount and status
      bill.paidAmount = totalPaid;

      if (totalPaid >= bill.totalAmount) {
        bill.status = BillStatus.PAID;
      } else if (totalPaid > 0) {
        bill.status = BillStatus.PARTIAL;
      }

      await bill.save({ session });

      await session.commitTransaction();
      this.logger.log(
        `Payment ${payment._id}: ${dto.amount} for bill ${dto.billId}. Total paid: ${totalPaid}/${bill.totalAmount}`,
      );

      // Fire-and-forget: send payment confirmation email to tenant
      this.sendPaymentEmail(bill, dto.amount, dto.method ?? 'CASH', totalPaid).catch((err) =>
        this.logger.error('Payment email error', err),
      );

      return payment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findAll(
    user: UserPayload,
    filters?: {
      billId?: string;
      method?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<PaymentDocument[]> {
    const query: Record<string, any> = {
      ownerId: new Types.ObjectId(user.ownerId),
    };

    if (filters?.billId) {
      query.billId = new Types.ObjectId(filters.billId);
    }

    if (filters?.method) {
      query.method = filters.method;
    }

    if (filters?.startDate || filters?.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    return this.paymentModel
      .find(query)
      .populate('billId', 'month year roomId contractId')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async findAllByBill(
    billId: string,
    user: UserPayload,
  ): Promise<PaymentDocument[]> {
    return this.paymentModel
      .find({
        billId: new Types.ObjectId(billId),
        ownerId: new Types.ObjectId(user.ownerId),
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  /**
   * Delete a payment and recalculate bill status.
   * Uses a transaction to ensure consistency.
   */
  async remove(
    id: string,
    user: UserPayload,
  ): Promise<{ message: string }> {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const ownerObjectId = new Types.ObjectId(user.ownerId);

      const payment = await this.paymentModel
        .findOne({ _id: id, ownerId: ownerObjectId })
        .session(session);

      if (!payment) {
        throw new NotFoundException('Payment not found or access denied');
      }

      const billId = payment.billId;
      // Soft-delete within the session to keep the write atomic
      (payment as any).isDeleted = true;
      (payment as any).deletedAt = new Date();
      (payment as any).deletedBy = new Types.ObjectId(user.userId);
      await payment.save({ session });

      // Recalculate bill totals from non-deleted payments only
      const result = await this.paymentModel.aggregate([
        { $match: { billId, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]).session(session);

      const totalPaid = result.length > 0 ? (result[0].total as number) : 0;

      const bill = await this.billModel.findById(billId).session(session);
      if (bill) {
        bill.paidAmount = totalPaid;
        if (totalPaid >= bill.totalAmount) {
          bill.status = BillStatus.PAID;
        } else if (totalPaid > 0) {
          bill.status = BillStatus.PARTIAL;
        } else {
          bill.status = BillStatus.UNPAID;
        }
        await bill.save({ session });
      }

      await session.commitTransaction();
      return { message: 'Payment deleted and bill updated' };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Non-blocking: find tenant email and send payment confirmation.
   */
  private async sendPaymentEmail(
    bill: BillDocument,
    amount: number,
    method: string,
    totalPaid: number,
  ): Promise<void> {
    const contract = await this.contractModel
      .findById(bill.contractId)
      .lean()
      .exec();
    if (!contract) return;

    const tenant = await this.tenantModel.findById(contract.tenantId).lean().exec();
    if (!tenant?.email) return;

    const isPaid = totalPaid >= bill.totalAmount;
    await this.mailService.sendPaymentConfirmation(tenant.email, {
      tenantName: tenant.fullName,
      amount,
      method,
      month: bill.month,
      year: bill.year,
      paidAt: format(new Date(), 'dd/MM/yyyy HH:mm', { locale: vi }),
      remainingAmount: Math.max(0, bill.totalAmount - totalPaid),
      isPaid,
    });
  }
}
