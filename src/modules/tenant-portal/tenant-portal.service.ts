import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { TenantPayload } from '../tenant-auth/tenant-auth.service';

@Injectable()
export class TenantPortalService {
  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Contract.name) private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
  ) {}

  /**
   * Find all active contracts for the tenant.
   */
  private async getTenantContractIds(tenantPayload: TenantPayload): Promise<Types.ObjectId[]> {
    const contracts = await this.contractModel
      .find({ tenantId: new Types.ObjectId(tenantPayload.tenantId) })
      .select('_id')
      .lean()
      .exec();
    return contracts.map((c) => c._id as Types.ObjectId);
  }

  /**
   * Get all bills for the tenant (via their contracts).
   */
  async getBills(tenantPayload: TenantPayload): Promise<BillDocument[]> {
    const contractIds = await this.getTenantContractIds(tenantPayload);
    if (contractIds.length === 0) return [];

    return this.billModel
      .find({ contractId: { $in: contractIds }, isDeleted: { $ne: true } })
      .sort({ year: -1, month: -1 })
      .lean()
      .exec();
  }

  /**
   * Get one bill, verifying tenant ownership.
   */
  async getBill(id: string, tenantPayload: TenantPayload): Promise<BillDocument> {
    const contractIds = await this.getTenantContractIds(tenantPayload);
    if (contractIds.length === 0) {
      throw new NotFoundException('Bill not found');
    }

    const bill = await this.billModel
      .findOne({
        _id: new Types.ObjectId(id),
        contractId: { $in: contractIds },
        isDeleted: { $ne: true },
      })
      .lean()
      .exec();

    if (!bill) {
      throw new NotFoundException('Bill not found or access denied');
    }

    return bill;
  }

  /**
   * Get payment history for the tenant's bills.
   */
  async getPayments(tenantPayload: TenantPayload): Promise<PaymentDocument[]> {
    const contractIds = await this.getTenantContractIds(tenantPayload);
    if (contractIds.length === 0) return [];

    // Get bill IDs for this tenant's contracts
    const bills = await this.billModel
      .find({ contractId: { $in: contractIds }, isDeleted: { $ne: true } })
      .select('_id')
      .lean()
      .exec();

    const billIds = bills.map((b) => b._id as Types.ObjectId);
    if (billIds.length === 0) return [];

    return this.paymentModel
      .find({ billId: { $in: billIds }, isDeleted: { $ne: true } })
      .populate({ path: 'billId', select: 'month year' })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
