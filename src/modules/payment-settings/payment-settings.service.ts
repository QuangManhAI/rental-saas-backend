import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaymentSettings, PaymentSettingsDocument } from './payment-settings.schema';
import { UpsertPaymentSettingsDto } from './dto/upsert-payment-settings.dto';

@Injectable()
export class PaymentSettingsService {
    constructor(
        @InjectModel(PaymentSettings.name)
        private readonly paymentSettingsModel: Model<PaymentSettingsDocument>,
    ) { }

    /**
     * Get payment settings for an owner
     */
    async getByOwnerId(ownerId: string): Promise<PaymentSettingsDocument | null> {
        return this.paymentSettingsModel
            .findOne({ ownerId: new Types.ObjectId(ownerId) })
            .lean()
            .exec();
    }

    /**
     * Upsert payment settings for an owner (one per owner)
     */
    async upsert(
        ownerId: string,
        dto: UpsertPaymentSettingsDto,
    ): Promise<PaymentSettingsDocument> {
        const ownerObjectId = new Types.ObjectId(ownerId);

        const updated = await this.paymentSettingsModel.findOneAndUpdate(
            { ownerId: ownerObjectId },
            {
                $set: {
                    ...dto,
                    ownerId: ownerObjectId,
                },
            },
            { new: true, upsert: true },
        );

        return updated;
    }

    /**
     * Check if owner has active payment settings
     */
    async hasActiveSettings(ownerId: string): Promise<boolean> {
        const settings = await this.getByOwnerId(ownerId);
        return settings?.isActive ?? false;
    }

    /**
     * Get active settings for payment processing
     */
    async getActiveSettings(ownerId: string): Promise<PaymentSettingsDocument> {
        const settings = await this.getByOwnerId(ownerId);
        if (!settings || !settings.isActive) {
            throw new NotFoundException('Payment settings not configured or inactive');
        }
        return settings;
    }

    /**
     * Find owner's payment settings by MoMo partnerCode
     * Used for IPN webhook to resolve which owner the payment belongs to
     */
    async findByPartnerCode(partnerCode: string): Promise<PaymentSettingsDocument | null> {
        return this.paymentSettingsModel
            .findOne({ momoPartnerCode: partnerCode })
            .lean()
            .exec();
    }
}
