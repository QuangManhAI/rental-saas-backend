import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
  Param,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TelegramService } from './telegram.service';
import { ReportService } from '../report/report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { SendMessageDto } from './dto/send-message.dto';
import { Customer, CustomerDocument } from '../customers/customer.schema';
import { User, UserDocument } from '../users/users.schema';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly reportService: ReportService,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) { }

  /**
   * GET /api/telegram/link-url
   * Get the Telegram link URL for the current owner to link their account.
   */
  @Get('link-url')
  @UseGuards(JwtAuthGuard)
  getOwnerLinkUrl(@CurrentUser() user: UserPayload) {
    // Use ownerId for the link (owner links their own account)
    return {
      url: `https://t.me/quangManhAI_bot?start=owner_${user.ownerId}`,
      ownerId: user.ownerId,
    };
  }

  /**
   * GET /api/telegram/status
   * Get the current owner's Telegram connection status.
   */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  async getOwnerStatus(@CurrentUser() user: UserPayload) {
    const owner = await this.userModel.findById(user.ownerId);
    return {
      connected: !!owner?.telegramChatId,
      chatId: owner?.telegramChatId || null,
    };
  }

  /**
   * POST /api/telegram/link
   * Manually link Telegram chat ID for the current owner.
   * Body: { chatId: string }
   */
  @Post('link')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async linkTelegram(
    @CurrentUser() user: UserPayload,
    @Body() body: { chatId: string },
  ) {
    if (!body.chatId) {
      throw new Error('chatId is required');
    }

    const owner = await this.userModel.findById(user.ownerId);
    if (!owner) {
      throw new Error('Owner not found');
    }

    owner.telegramChatId = body.chatId;
    await owner.save();

    return {
      ok: true,
      message: 'Telegram linked successfully',
      chatId: body.chatId,
    };
  }

  /**
   * POST /api/telegram/webhook
   * Telegram webhook endpoint (no auth required).
   * Handles both owner linking (owner_<id>) and customer linking (<customerId>).
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() update: any) {
    console.log('=== TELEGRAM WEBHOOK RECEIVED ===');
    console.log(JSON.stringify(update, null, 2));
    console.log('=================================');

    try {
      const message = update.message;
      if (!message || !message.text || !message.chat) {
        console.log('❌ Webhook ignored: Missing message, text, or chat');
        return { ok: true };
      }

      const chatId = message.chat.id.toString();
      const text = message.text.trim();

      console.log(`📨 Processing message: "${text}" from chat: ${chatId}`);

      if (text.startsWith('/start ')) {
        const payload = text.split(' ')[1];
        if (!payload) {
          console.log('❌ Invalid /start command: No payload provided');
          await this.telegramService.sendMessage(chatId, '❌ Liên kết không hợp lệ. Vui lòng sử dụng liên kết chính xác.');
          return { ok: true };
        }

        // Check if this is an OWNER linking (format: owner_<userId>)
        if (payload.startsWith('owner_')) {
          const ownerId = payload.replace('owner_', '');
          console.log(`🔍 Looking up owner: ${ownerId}`);

          if (!Types.ObjectId.isValid(ownerId)) {
            console.log(`❌ Invalid owner ID format: ${ownerId}`);
            await this.telegramService.sendMessage(chatId, '❌ ID chủ nhà trọ không hợp lệ.');
            return { ok: true };
          }

          const owner = await this.userModel.findById(ownerId);
          if (!owner) {
            console.log(`❌ Owner not found: ${ownerId}`);
            await this.telegramService.sendMessage(chatId, '❌ Không tìm thấy tài khoản chủ nhà trọ.');
            return { ok: true };
          }

          console.log(`✅ Connecting owner ${owner.fullName} to Telegram chat ${chatId}`);
          owner.telegramChatId = chatId;
          await owner.save();

          await this.telegramService.sendMessage(
            chatId,
            `✅ Liên kết Telegram thành công!\n\n👋 Chào ${owner.fullName}!\n\n📊 Bạn sẽ nhận được báo cáo doanh thu tại đây khi nhấn "Gửi Telegram" trong ứng dụng.`,
          );
          console.log('✅ Owner webhook processed successfully');
          return { ok: true };
        }

        // Otherwise, this is a CUSTOMER linking (format: <customerId>)
        const customerId = payload;
        console.log(`🔍 Looking up customer: ${customerId}`);

        if (!Types.ObjectId.isValid(customerId)) {
          console.log(`❌ Invalid customer ID format: ${customerId}`);
          await this.telegramService.sendMessage(chatId, '❌ ID khách hàng không hợp lệ.');
          return { ok: true };
        }

        const customer = await this.customerModel.findById(customerId);
        if (!customer) {
          console.log(`❌ Customer not found: ${customerId}`);
          await this.telegramService.sendMessage(chatId, '❌ Khách hàng không tồn tại.');
          return { ok: true };
        }

        console.log(`✅ Connecting customer ${customer.name} to Telegram chat ${chatId}`);
        customer.telegramChatId = chatId;
        await customer.save();

        await this.telegramService.sendMessage(
          chatId,
          `✅ Telegram connected successfully!\n\n👋 Chào ${customer.name}!\n\nBạn sẽ nhận được thông báo tại đây.`,
        );
        console.log('✅ Customer webhook processed successfully');
      } else {
        console.log(`ℹ️  Ignoring non-/start message: "${text}"`);
      }

      return { ok: true };
    } catch (err) {
      console.error('❌ Webhook processing error:', err);
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  /**
   * POST /api/telegram/send
   * Send a custom text message via Telegram bot.
   */
  @Post('send')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() dto: SendMessageDto) {
    return this.telegramService.sendMessage(dto.chatId, dto.text);
  }

  /**
   * POST /api/telegram/test
   * Quick test — sends a ping to the current owner's linked Telegram.
   */
  @Post('test')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async test(@CurrentUser() user: UserPayload) {
    return this.telegramService.sendMessageToOwner(
      user.ownerId,
      '🏠 Rental SaaS — Telegram bot is working!',
    );
  }
}
