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
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserPayload } from '../../shared/types';
import { BillStatus } from '../bills/enums/bill-status.enum';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Bill.name)
    private readonly billModel: Model<BillDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

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

      // 3. Sum all payments for this bill
      const result = await this.paymentModel.aggregate([
        { $match: { billId: billObjectId } },
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

      return payment;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
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
      await payment.deleteOne({ session });

      // Recalculate bill totals
      const result = await this.paymentModel.aggregate([
        { $match: { billId } },
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
}
