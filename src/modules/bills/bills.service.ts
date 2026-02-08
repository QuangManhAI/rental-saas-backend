import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bill, BillDocument } from './bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { CreateBillDto } from './dto/create-bill.dto';
import { UserPayload } from '../../shared/types';
import { BillStatus } from './enums/bill-status.enum';
import { ContractStatus } from '../contracts/enums/contract-status.enum';

@Injectable()
export class BillsService {
  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Contract.name)
    private readonly contractModel: Model<ContractDocument>,
  ) {}

  async create(dto: CreateBillDto, user: UserPayload): Promise<BillDocument> {
    const ownerObjectId = new Types.ObjectId(user.ownerId);

    // 1. Validate contract
    const contract = await this.contractModel
      .findOne({ _id: dto.contractId, ownerId: ownerObjectId })
      .lean();

    if (!contract) {
      throw new NotFoundException('Contract not found or access denied');
    }

    if (contract.status !== ContractStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot create bill for a non-active contract',
      );
    }

    // 2. Validate meter readings
    if (dto.electricNewIndex < dto.electricOldIndex) {
      throw new BadRequestException(
        'Electric new index must be >= old index',
      );
    }
    if (dto.waterNewIndex < dto.waterOldIndex) {
      throw new BadRequestException('Water new index must be >= old index');
    }

    // 3. Calculate costs
    const electricCost =
      (dto.electricNewIndex - dto.electricOldIndex) * dto.electricRate;
    const waterCost =
      (dto.waterNewIndex - dto.waterOldIndex) * dto.waterRate;
    const otherFee = dto.otherFee || 0;
    const totalAmount = contract.rentPrice + electricCost + waterCost + otherFee;

    // 4. Create bill with snapshot of contract rent price
    return this.billModel.create({
      contractId: new Types.ObjectId(dto.contractId),
      roomId: contract.roomId,
      month: dto.month,
      year: dto.year,
      electricOldIndex: dto.electricOldIndex,
      electricNewIndex: dto.electricNewIndex,
      electricRate: dto.electricRate,
      electricCost,
      waterOldIndex: dto.waterOldIndex,
      waterNewIndex: dto.waterNewIndex,
      waterRate: dto.waterRate,
      waterCost,
      roomPrice: contract.rentPrice,
      otherFee,
      totalAmount,
      paidAmount: 0,
      status: BillStatus.UNPAID,
      ownerId: ownerObjectId,
    });
  }

  async findAll(user: UserPayload): Promise<BillDocument[]> {
    return this.billModel
      .find({ ownerId: new Types.ObjectId(user.ownerId) })
      .populate({
        path: 'contractId',
        select: 'startDate endDate status',
      })
      .populate('roomId', 'name')
      .sort({ year: -1, month: -1 })
      .lean()
      .exec();
  }

  async findOne(id: string, user: UserPayload): Promise<BillDocument> {
    const bill = await this.billModel
      .findOne({
        _id: id,
        ownerId: new Types.ObjectId(user.ownerId),
      })
      .populate('contractId')
      .populate('roomId', 'name')
      .lean();

    if (!bill) {
      throw new NotFoundException('Bill not found or access denied');
    }
    return bill as BillDocument;
  }

  async remove(
    id: string,
    user: UserPayload,
  ): Promise<{ message: string }> {
    const bill = await this.billModel.findOne({
      _id: id,
      ownerId: new Types.ObjectId(user.ownerId),
    });

    if (!bill) {
      throw new NotFoundException('Bill not found or access denied');
    }

    if (bill.status === BillStatus.PAID) {
      throw new BadRequestException('Cannot delete a paid bill');
    }

    await bill.deleteOne();
    return { message: 'Bill deleted successfully' };
  }

  /**
   * Called by PaymentsService to update paid amount and status.
   */
  async updatePaidAmount(
    billId: string,
    paidAmount: number,
  ): Promise<BillDocument> {
    const bill = await this.billModel.findById(billId);
    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    bill.paidAmount = paidAmount;

    if (paidAmount >= bill.totalAmount) {
      bill.status = BillStatus.PAID;
    } else if (paidAmount > 0) {
      bill.status = BillStatus.PARTIAL;
    } else {
      bill.status = BillStatus.UNPAID;
    }

    return bill.save();
  }
}
