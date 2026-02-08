import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { User, UserDocument } from '../users/users.schema';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly http: AxiosInstance | null = null;
  private readonly botToken: string;
  private readonly isConfigured: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    this.isConfigured = !!this.botToken;

    if (this.isConfigured) {
      this.http = axios.create({
        baseURL: `https://api.telegram.org/bot${this.botToken}`,
        timeout: 10_000,
      });
      this.logger.log('Telegram bot initialized');
    } else {
      this.logger.warn('Telegram not configured — set TELEGRAM_BOT_TOKEN in .env');
    }
  }

  /**
   * Send a text message to a specific chat ID.
   */
  async sendMessage(chatId: string, text: string): Promise<{ ok: boolean }> {
    if (!chatId) {
      this.logger.error('sendMessage called without chatId');
      throw new BadRequestException('Chat ID is required');
    }

    if (!this.isConfigured || !this.http) {
      this.logger.warn(`[DRY RUN] Would send to ${chatId}: ${text}`);
      return { ok: false };
    }

    try {
      await this.http.post('/sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });
      this.logger.log(`Message sent to chat ${chatId}`);
      return { ok: true };
    } catch (err: any) {
      this.logger.error(
        `Failed to send message to ${chatId}: ${err.response?.data?.description || err.message}`,
      );
      return { ok: false };
    }
  }

  /**
   * Send a document (file) via Telegram.
   */
  async sendDocument(
    chatId: string,
    fileBuffer: Buffer,
    filename: string,
    caption?: string,
  ): Promise<{ ok: boolean }> {
    if (!chatId) {
      this.logger.error('sendDocument called without chatId');
      throw new BadRequestException('Chat ID is required');
    }

    if (!this.isConfigured || !this.http) {
      this.logger.warn(`[DRY RUN] Would send document ${filename} to ${chatId}`);
      return { ok: false };
    }

    try {
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('document', fileBuffer, { filename });
      if (caption) form.append('caption', caption);

      await this.http.post('/sendDocument', form, {
        headers: form.getHeaders(),
      });
      this.logger.log(`Document ${filename} sent to chat ${chatId}`);
      return { ok: true };
    } catch (err: any) {
      this.logger.error(
        `Failed to send document to ${chatId}: ${err.response?.data?.description || err.message}`,
      );
      return { ok: false };
    }
  }

  /* ─────────────────────────────────────────────────────────
   * OWNER methods - Send to the business owner (User)
   * ───────────────────────────────────────────────────────── */

  /**
   * Send message to owner by their user ID.
   */
  async sendMessageToOwner(ownerId: string, text: string): Promise<{ ok: boolean }> {
    if (!Types.ObjectId.isValid(ownerId)) {
      this.logger.error(`Invalid ownerId format: ${ownerId}`);
      throw new BadRequestException('Invalid owner ID format');
    }

    const owner = await this.userModel.findById(ownerId);
    if (!owner) {
      this.logger.error(`Owner not found: ${ownerId}`);
      throw new BadRequestException('Owner not found');
    }

    if (!owner.telegramChatId) {
      this.logger.error(`Owner ${ownerId} has not linked Telegram`);
      throw new BadRequestException('Bạn chưa liên kết Telegram. Vui lòng liên kết trước.');
    }

    this.logger.log(`Sending message to owner ${ownerId} (chat: ${owner.telegramChatId})`);
    return this.sendMessage(owner.telegramChatId, text);
  }

  /**
   * Send document to owner by their user ID.
   */
  async sendDocumentToOwner(
    ownerId: string,
    fileBuffer: Buffer,
    filename: string,
    caption?: string,
  ): Promise<{ ok: boolean }> {
    if (!Types.ObjectId.isValid(ownerId)) {
      this.logger.error(`Invalid ownerId format: ${ownerId}`);
      throw new BadRequestException('Invalid owner ID format');
    }

    const owner = await this.userModel.findById(ownerId);
    if (!owner) {
      this.logger.error(`Owner not found: ${ownerId}`);
      throw new BadRequestException('Owner not found');
    }

    if (!owner.telegramChatId) {
      this.logger.error(`Owner ${ownerId} has not linked Telegram`);
      throw new BadRequestException('Bạn chưa liên kết Telegram. Vui lòng liên kết trước.');
    }

    this.logger.log(`Sending document to owner ${ownerId} (chat: ${owner.telegramChatId})`);
    return this.sendDocument(owner.telegramChatId, fileBuffer, filename, caption);
  }

  /**
   * Check if owner has linked Telegram.
   */
  async isOwnerLinked(ownerId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(ownerId)) {
      return false;
    }
    const owner = await this.userModel.findById(ownerId);
    return !!owner?.telegramChatId;
  }

  /* ─────────────────────────────────────────────────────────
   * CUSTOMER methods - kept for backwards compatibility
   * ───────────────────────────────────────────────────────── */

  /**
   * Send message to a customer by their ID.
   */
  async sendMessageToCustomer(customerId: string, text: string): Promise<{ ok: boolean }> {
    if (!Types.ObjectId.isValid(customerId)) {
      this.logger.error(`Invalid customerId format: ${customerId}`);
      throw new BadRequestException('Invalid customer ID format');
    }

    const customer = await this.customerModel.findById(customerId);
    if (!customer) {
      this.logger.error(`Customer not found: ${customerId}`);
      throw new BadRequestException('Customer not found');
    }

    if (!customer.telegramChatId) {
      this.logger.error(`Customer ${customerId} has not linked Telegram`);
      throw new BadRequestException('Customer has not connected Telegram.');
    }

    return this.sendMessage(customer.telegramChatId, text);
  }

  /**
   * Send Excel document to a customer by their ID.
   */
  async sendExcelToCustomer(
    customerId: string,
    fileBuffer: Buffer,
    filename: string = 'report.xlsx',
    caption: string = 'Monthly Report',
  ): Promise<{ ok: boolean }> {
    if (!Types.ObjectId.isValid(customerId)) {
      this.logger.error(`Invalid customerId format: ${customerId}`);
      throw new BadRequestException('Invalid customer ID format');
    }

    const customer = await this.customerModel.findById(customerId);
    if (!customer) {
      this.logger.error(`Customer not found: ${customerId}`);
      throw new BadRequestException('Customer not found');
    }

    if (!customer.telegramChatId) {
      this.logger.error(`Customer ${customerId} has not linked Telegram`);
      throw new BadRequestException('Customer has not connected Telegram.');
    }

    return this.sendDocument(customer.telegramChatId, fileBuffer, filename, caption);
  }

  /* ─────────────────────────────────────────────────────────
   * SEND REPORT - Convenience function for sending files from disk
   * ───────────────────────────────────────────────────────── */

  /**
   * Send a report file (Excel or any document) to a customer by ID.
   * Reads file from disk and sends via Telegram.
   *
   * @param customerId - MongoDB ObjectId of the customer
   * @param filePath - Absolute path to the file on disk
   * @param caption - Optional caption for the document
   * @returns Promise with result status and optional error message
   */
  async sendReport(
    customerId: string,
    filePath: string,
    caption?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    // Validate customerId format
    if (!Types.ObjectId.isValid(customerId)) {
      this.logger.error(`Invalid customerId format: ${customerId}`);
      return { ok: false, error: 'Invalid customer ID format' };
    }

    // 1. Read file from disk
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
      this.logger.log(`File read successfully: ${filePath} (${fileBuffer.length} bytes)`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.logger.error(`File not found: ${filePath}`);
        return { ok: false, error: `File not found: ${filePath}` };
      }
      this.logger.error(`Error reading file ${filePath}: ${err.message}`);
      return { ok: false, error: `Error reading file: ${err.message}` };
    }

    // 2. Query database for customer's chat_id
    const customer = await this.customerModel.findById(customerId);
    if (!customer) {
      this.logger.error(`Customer not found: ${customerId}`);
      return { ok: false, error: 'Customer not found' };
    }

    if (!customer.telegramChatId) {
      this.logger.error(`Customer ${customerId} has not linked Telegram`);
      return { ok: false, error: 'Customer has not connected Telegram' };
    }

    // 3. Extract filename from path
    const filename = path.basename(filePath);

    // 4. Send document via Telegram
    try {
      const result = await this.sendDocument(
        customer.telegramChatId,
        fileBuffer,
        filename,
        caption || `📎 Report: ${filename}`,
      );
      return result;
    } catch (err: any) {
      // Handle specific Telegram errors
      const errorDesc = err.response?.data?.description || err.message;

      if (errorDesc?.includes('blocked')) {
        this.logger.error(`Bot blocked by user ${customerId}`);
        return { ok: false, error: 'Bot was blocked by the user' };
      }
      if (errorDesc?.includes('chat not found')) {
        this.logger.error(`Chat not found for customer ${customerId}`);
        return { ok: false, error: 'Chat not found - user may have deleted the chat' };
      }

      this.logger.error(`Failed to send report to ${customerId}: ${errorDesc}`);
      return { ok: false, error: `Telegram error: ${errorDesc}` };
    }
  }

  /**
   * Send a report file to an owner by ID.
   * Similar to sendReport but for owners/users.
   */
  async sendReportToOwner(
    ownerId: string,
    filePath: string,
    caption?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    // Validate ownerId format
    if (!Types.ObjectId.isValid(ownerId)) {
      this.logger.error(`Invalid ownerId format: ${ownerId}`);
      return { ok: false, error: 'Invalid owner ID format' };
    }

    // Read file from disk
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
      this.logger.log(`File read successfully: ${filePath} (${fileBuffer.length} bytes)`);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        this.logger.error(`File not found: ${filePath}`);
        return { ok: false, error: `File not found: ${filePath}` };
      }
      this.logger.error(`Error reading file ${filePath}: ${err.message}`);
      return { ok: false, error: `Error reading file: ${err.message}` };
    }

    // Query database for owner's chat_id
    const owner = await this.userModel.findById(ownerId);
    if (!owner) {
      this.logger.error(`Owner not found: ${ownerId}`);
      return { ok: false, error: 'Owner not found' };
    }

    if (!owner.telegramChatId) {
      this.logger.error(`Owner ${ownerId} has not linked Telegram`);
      return { ok: false, error: 'Owner has not connected Telegram' };
    }

    const filename = path.basename(filePath);

    try {
      const result = await this.sendDocument(
        owner.telegramChatId,
        fileBuffer,
        filename,
        caption || `📎 Report: ${filename}`,
      );
      return result;
    } catch (err: any) {
      const errorDesc = err.response?.data?.description || err.message;
      this.logger.error(`Failed to send report to owner ${ownerId}: ${errorDesc}`);
      return { ok: false, error: `Telegram error: ${errorDesc}` };
    }
  }
}
