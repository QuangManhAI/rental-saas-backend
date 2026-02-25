import { Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Encrypted value stored in MongoDB.
 * All three parts are hex-encoded strings.
 */
export interface EncryptedValue {
  iv: string;       // 12-byte IV, hex (24 chars)
  data: string;     // Ciphertext, hex
  tag: string;      // 16-byte GCM auth tag, hex (32 chars)
}

/**
 * EncryptionService — AES-256-GCM symmetric encryption.
 *
 * Uses ENCRYPTION_MASTER_KEY (32-byte hex = 64 chars) from environment.
 * Generates a unique IV per encryption call, ensuring ciphertext never repeats.
 *
 * Usage:
 *   const enc = encryptionService.encrypt('my-secret');
 *   const plain = encryptionService.decrypt(enc);
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private masterKey: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const keyHex = this.configService.get<string>('ENCRYPTION_MASTER_KEY');
    if (!keyHex || keyHex.length !== 64) {
      this.logger.error(
        'ENCRYPTION_MASTER_KEY must be a 64-character hex string (32 bytes). ' +
        'Run scripts/generate-secrets.sh to generate one.',
      );
      throw new InternalServerErrorException(
        'Server misconfiguration: encryption key missing or invalid.',
      );
    }
    this.masterKey = Buffer.from(keyHex, 'hex');
  }

  /**
   * Encrypt plaintext using AES-256-GCM.
   * Returns an EncryptedValue object safe to store in MongoDB.
   */
  encrypt(plaintext: string): EncryptedValue {
    const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      iv: iv.toString('hex'),
      data: encrypted.toString('hex'),
      tag: tag.toString('hex'),
    };
  }

  /**
   * Decrypt an EncryptedValue back to plaintext.
   * Throws if the auth tag does not match (tampered data).
   */
  decrypt(encrypted: EncryptedValue): string {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.masterKey,
        Buffer.from(encrypted.iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted.data, 'hex')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Failed to decrypt value — data may be corrupted or key has changed.',
      );
    }
  }

  /**
   * Returns true if the value looks like an encrypted object.
   */
  isEncrypted(value: unknown): value is EncryptedValue {
    return (
      typeof value === 'object' &&
      value !== null &&
      'iv' in value &&
      'data' in value &&
      'tag' in value
    );
  }
}
