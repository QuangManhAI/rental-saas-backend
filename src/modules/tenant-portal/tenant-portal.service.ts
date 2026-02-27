import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Bill, BillDocument } from '../bills/bills.schema';
import { Contract, ContractDocument } from '../contracts/contracts.schema';
import { Payment, PaymentDocument } from '../payments/payments.schema';
import { TenantPayload } from '../tenant-auth/tenant-auth.service';
import { MomoService } from '../momo/momo.service';
import { VnpayService } from '../vnpay/vnpay.service';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { UserPayload } from '../../shared/types';

@Injectable()
export class TenantPortalService {
  constructor(
    @InjectModel(Bill.name) private readonly billModel: Model<BillDocument>,
    @InjectModel(Contract.name) private readonly contractModel: Model<ContractDocument>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    private readonly momoService: MomoService,
    private readonly vnpayService: VnpayService,
    private readonly paymentSettingsService: PaymentSettingsService,
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
   * Verify tenant owns this bill, then return it.
   */
  private async verifyBillOwnership(billId: string, tenantPayload: TenantPayload): Promise<BillDocument> {
    const contractIds = await this.getTenantContractIds(tenantPayload);
    if (contractIds.length === 0) throw new NotFoundException('Bill not found');

    const bill = await this.billModel
      .findOne({
        _id: new Types.ObjectId(billId),
        contractId: { $in: contractIds },
        isDeleted: { $ne: true },
      })
      .lean()
      .exec();

    if (!bill) throw new NotFoundException('Bill not found or access denied');
    return bill;
  }

  /**
   * Build a UserPayload-compatible object from TenantPayload for payment services.
   */
  private toUserPayload(tp: TenantPayload): UserPayload {
    return { sub: tp.tenantId, ownerId: tp.ownerId, role: 'tenant' } as any;
  }

  // ─── Bills & Payments ──────────────────────────────────────

  async getBills(tenantPayload: TenantPayload): Promise<BillDocument[]> {
    const contractIds = await this.getTenantContractIds(tenantPayload);
    if (contractIds.length === 0) return [];

    return this.billModel
      .find({ contractId: { $in: contractIds }, isDeleted: { $ne: true } })
      .sort({ year: -1, month: -1 })
      .lean()
      .exec();
  }

  async getBill(id: string, tenantPayload: TenantPayload): Promise<BillDocument> {
    return this.verifyBillOwnership(id, tenantPayload);
  }

  async getPayments(tenantPayload: TenantPayload): Promise<PaymentDocument[]> {
    const contractIds = await this.getTenantContractIds(tenantPayload);
    if (contractIds.length === 0) return [];

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

  // ─── Payment Methods ──────────────────────────────────────

  /**
   * Create MoMo payment for a tenant's bill.
   * Verifies tenant owns the bill, then delegates to MomoService.
   */
  async createMomoPayment(billId: string, tenantPayload: TenantPayload) {
    await this.verifyBillOwnership(billId, tenantPayload);
    return this.momoService.createPayment(billId, this.toUserPayload(tenantPayload));
  }

  /**
   * Create VNPay payment for a tenant's bill.
   */
  async createVnpayPayment(billId: string, tenantPayload: TenantPayload, ipAddr: string) {
    await this.verifyBillOwnership(billId, tenantPayload);
    return this.vnpayService.createPayment(billId, this.toUserPayload(tenantPayload), ipAddr);
  }

  /**
   * Check which payment methods are available for this owner.
   */
  async getAvailablePaymentMethods(tenantPayload: TenantPayload) {
    const methods: { id: string; name: string; available: boolean }[] = [
      { id: 'vietqr', name: 'VietQR (Chuyển khoản)', available: false },
      { id: 'momo', name: 'MoMo', available: false },
      { id: 'vnpay', name: 'VNPay', available: false },
    ];

    try {
      const settings = await this.paymentSettingsService.getByOwnerId(tenantPayload.ownerId);
      if (settings?.isActive) {
        const momoCreds = await this.paymentSettingsService.getDecryptedMomoCredentials(tenantPayload.ownerId);
        if (momoCreds) methods[1].available = true;

        const vnpayCreds = await this.paymentSettingsService.getDecryptedVnpayCredentials(tenantPayload.ownerId);
        if (vnpayCreds) methods[2].available = true;
      }
    } catch {
      // Payment settings not configured — methods stay unavailable
    }

    // VietQR is always available if owner has bank accounts (checked via QR endpoint)
    methods[0].available = true;

    return methods;
  }
}
