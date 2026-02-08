import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.get<string>('r2.accountId');
    const accessKeyId = this.configService.get<string>('r2.accessKeyId');
    const secretAccessKey = this.configService.get<string>('r2.secretAccessKey');
    this.bucket = this.configService.get<string>('r2.bucket', 'excel-rental');
    this.publicUrl = this.configService.get<string>('r2.publicUrl', '');

    this.isConfigured = !!(accountId && accessKeyId && secretAccessKey);

    if (this.isConfigured) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      });
      this.logger.log('R2 client initialized');
    } else {
      this.logger.warn(
        'R2 not configured — reports will be returned as base64 download',
      );
    }
  }

  /**
   * Upload a buffer to R2.
   * Returns public URL if available, otherwise a signed URL (1h), or base64 fallback.
   */
  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<{ url?: string; base64?: string; key: string }> {
    if (!this.isConfigured) {
      return {
        base64: buffer.toString('base64'),
        key,
      };
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    // Prefer public URL, fall back to signed URL
    let url: string;
    if (this.publicUrl) {
      url = `${this.publicUrl}/${key}`;
    } else {
      url = await getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: 3600 },
      );
    }

    this.logger.log(`Uploaded to R2: ${key}`);
    return { url, key };
  }
}
