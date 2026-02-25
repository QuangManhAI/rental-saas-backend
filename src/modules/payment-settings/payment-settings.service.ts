import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaymentSettings, PaymentSettingsDocument } from './payment-settings.schema';
import { UpsertPaymentSettingsDto } from './dto/upsert-payment-settings.dto';
import { EncryptionService } from '../../common/crypto/encryption.service';

/**
 * Plain (decrypted) MoMo credentials — for internal use only, never returned to client.
 */
export interface DecryptedMomoCredentials {
  partnerCode: string;
  accessKey: string;
  secretKey: string;
  environment: 'sandbox' | 'production';
}

/**
 * Plain (decrypted) VNPay credentials — for internal use only.
 */
export interface DecryptedVnpayCredentials {
  tmnCode: string;
  hashSecret: string;
}

const PS_TTL = 5 * 60 * 1000; // 5 minutes in ms
const psOwnerKey = (ownerId: string) => `ps:owner:${ownerId}`;
const psPartnerKey = (partnerCode: string) => `ps:partner:${partnerCode}`;

@Injectable()
export class PaymentSettingsService {
  constructor(
    @InjectModel(PaymentSettings.name)
    private readonly paymentSettingsModel: Model<PaymentSettingsDocument>,
    private readonly encryptionService: EncryptionService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Get raw payment settings document for an owner.
   * Credentials remain encrypted in the returned document.
   */
  async getByOwnerId(ownerId: string): Promise<PaymentSettingsDocument | null> {
    const cacheKey = psOwnerKey(ownerId);
    const cached = await this.cacheManager.get<PaymentSettingsDocument>(cacheKey);
    if (cached) return cached;

    const settings = await this.paymentSettingsModel
      .findOne({ ownerId: new Types.ObjectId(ownerId) })
      .exec();

    if (settings) {
      await this.cacheManager.set(cacheKey, settings, PS_TTL);
    }
    return settings;
  }

  /**
   * Get decrypted MoMo credentials for a given owner.
   * Returns null if the owner has no MoMo configuration.
   */
  async getDecryptedMomoCredentials(ownerId: string): Promise<DecryptedMomoCredentials | null> {
    const settings = await this.getByOwnerId(ownerId);
    if (!settings || !settings.momoPartnerCode || !settings.momoAccessKey || !settings.momoSecretKey) {
      return null;
    }
    return {
      partnerCode: settings.momoPartnerCode,
      accessKey: this.encryptionService.decrypt(settings.momoAccessKey as any),
      secretKey: this.encryptionService.decrypt(settings.momoSecretKey as any),
      environment: settings.environment,
    };
  }

  /**
   * Upsert payment settings for an owner.
   * String credentials in the DTO are encrypted before storage.
   * Invalidates owner cache on write.
   */
  async upsert(
    ownerId: string,
    dto: UpsertPaymentSettingsDto,
  ): Promise<PaymentSettingsDocument> {
    const ownerObjectId = new Types.ObjectId(ownerId);

    const updateData: Record<string, unknown> = { ownerId: ownerObjectId };

    if (dto.provider !== undefined) updateData.provider = dto.provider;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    // momoPartnerCode is not a secret (appears in IPN), store plaintext
    if (dto.momoPartnerCode !== undefined) {
      updateData.momoPartnerCode = dto.momoPartnerCode;
    }
    // Encrypt secret credentials
    if (dto.momoAccessKey !== undefined) {
      updateData.momoAccessKey = this.encryptionService.encrypt(dto.momoAccessKey);
    }
    if (dto.momoSecretKey !== undefined) {
      updateData.momoSecretKey = this.encryptionService.encrypt(dto.momoSecretKey);
    }
    if (dto.vnpayTmnCode !== undefined) {
      updateData.vnpayTmnCode = dto.vnpayTmnCode;
    }
    if (dto.vnpayHashSecret !== undefined) {
      updateData.vnpayHashSecret = this.encryptionService.encrypt(dto.vnpayHashSecret);
    }

    const result = await this.paymentSettingsModel.findOneAndUpdate(
      { ownerId: ownerObjectId },
      { $set: updateData },
      { new: true, upsert: true },
    );

    // Invalidate caches
    await this.cacheManager.del(psOwnerKey(ownerId));
    if (dto.momoPartnerCode) {
      await this.cacheManager.del(psPartnerKey(dto.momoPartnerCode));
    }

    return result;
  }

  /**
   * Check if owner has active payment settings configured.
   */
  async hasActiveSettings(ownerId: string): Promise<boolean> {
    const settings = await this.getByOwnerId(ownerId);
    return settings?.isActive ?? false;
  }

  /**
   * Get active, decrypted MoMo credentials (throws if not configured/inactive).
   */
  async getActiveSettings(ownerId: string): Promise<DecryptedMomoCredentials> {
    const settings = await this.getByOwnerId(ownerId);
    if (!settings || !settings.isActive) {
      throw new NotFoundException('Payment settings not configured or inactive');
    }
    const creds = await this.getDecryptedMomoCredentials(ownerId);
    if (!creds) {
      throw new NotFoundException('MoMo credentials not configured');
    }
    return creds;
  }

  /**
   * Find settings by MoMo partnerCode (for IPN webhook routing).
   */
  async findByPartnerCode(partnerCode: string): Promise<PaymentSettingsDocument | null> {
    const cacheKey = psPartnerKey(partnerCode);
    const cached = await this.cacheManager.get<PaymentSettingsDocument>(cacheKey);
    if (cached) return cached;

    const settings = await this.paymentSettingsModel
      .findOne({ momoPartnerCode: partnerCode })
      .exec();

    if (settings) {
      await this.cacheManager.set(cacheKey, settings, PS_TTL);
    }
    return settings;
  }

  /**
   * Get decrypted MoMo credentials by partnerCode (for IPN processing).
   */
  async getDecryptedCredentialsByPartnerCode(
    partnerCode: string,
  ): Promise<DecryptedMomoCredentials | null> {
    const settings = await this.findByPartnerCode(partnerCode);
    if (!settings || !settings.momoAccessKey || !settings.momoSecretKey) {
      return null;
    }
    return {
      partnerCode: settings.momoPartnerCode!,
      accessKey: this.encryptionService.decrypt(settings.momoAccessKey as any),
      secretKey: this.encryptionService.decrypt(settings.momoSecretKey as any),
      environment: settings.environment,
    };
  }

  /**
   * Get decrypted VNPay credentials for a given owner.
   * Returns null if owner has no VNPay configuration.
   */
  async getDecryptedVnpayCredentials(ownerId: string): Promise<DecryptedVnpayCredentials | null> {
    const settings = await this.getByOwnerId(ownerId);
    if (!settings || !settings.vnpayTmnCode || !settings.vnpayHashSecret) {
      return null;
    }
    return {
      tmnCode: settings.vnpayTmnCode,
      hashSecret: this.encryptionService.decrypt(settings.vnpayHashSecret as any),
    };
  }
}
