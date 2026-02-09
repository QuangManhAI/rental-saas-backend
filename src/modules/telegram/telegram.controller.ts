import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Get,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TelegramService } from './telegram.service';
import { MomoService } from '../momo/momo.service';
import { ReportService } from '../report/report.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { SendMessageDto } from './dto/send-message.dto';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { User, UserDocument } from '../users/users.schema';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly reportService: ReportService,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly momoService: MomoService,
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
   * Handles both owner linking (owner_<id>) and tenant linking (tenant_<tenantId>).
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
        // Robust split to handle multiple spaces
        const parts = text.split(/\s+/);
        const payload = parts[1] ? parts[1].trim() : null;

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

        // Check if this is a TENANT linking (format: tenant_<tenantId>)
        if (payload.startsWith('tenant_')) {
          const tenantId = payload.replace('tenant_', '');
          console.log(`🔍 Looking up tenant: ${tenantId}`);

          if (!Types.ObjectId.isValid(tenantId)) {
            console.log(`❌ Invalid tenant ID format: ${tenantId}`);
            await this.telegramService.sendMessage(chatId, '❌ ID khách thuê không hợp lệ.');
            return { ok: true };
          }

          const tenant = await this.tenantModel.findById(tenantId);
          if (!tenant) {
            console.log(`❌ Tenant not found: ${tenantId}`);
            await this.telegramService.sendMessage(chatId, '❌ Khách thuê không tồn tại.');
            return { ok: true };
          }

          console.log(`✅ Connecting tenant ${tenant.fullName} to Telegram chat ${chatId}`);
          tenant.telegramChatId = chatId;
          tenant.telegramLinkedAt = new Date();
          await tenant.save();

          await this.telegramService.sendMessage(
            chatId,
            `✅ Telegram connected successfully!\n\n👋 Chào ${tenant.fullName}!\n\nBạn sẽ nhận được thông báo hoá đơn và thanh toán tại đây.`,
          );
          console.log('✅ Tenant webhook processed successfully');
          return { ok: true };
        }

        // Check if this is a CONTRACT linking (format: contract_<contractId>)
        if (payload.startsWith('contract_')) {
          const contractId = payload.replace('contract_', '');
          console.log(`🔍 Looking up contract: ${contractId}`);

          if (!Types.ObjectId.isValid(contractId)) {
            console.log(`❌ Invalid contract ID format: ${contractId}`);
            await this.telegramService.sendMessage(chatId, '❌ Mã hợp đồng không hợp lệ.');
            return { ok: true };
          }

          // Import Contract model dynamically to avoid circular deps
          const Contract = this.tenantModel.db.model('Contract');
          const Bill = this.tenantModel.db.model('Bill');

          const contract = await Contract.findById(contractId).lean() as any;
          if (!contract) {
            console.log(`❌ Contract not found: ${contractId}`);
            await this.telegramService.sendMessage(chatId, '❌ Hợp đồng không tồn tại.');
            return { ok: true };
          }

          // Find tenant for this contract
          const tenant = await this.tenantModel.findById(contract.tenantId);
          if (!tenant) {
            console.log(`❌ Tenant not found for contract: ${contractId}`);
            await this.telegramService.sendMessage(chatId, '❌ Không tìm thấy khách thuê.');
            return { ok: true };
          }

          // Check if already linked
          if (tenant.telegramChatId && tenant.telegramChatId === chatId) {
            console.log(`ℹ️ Tenant ${tenant.fullName} already linked to this chat`);
            await this.telegramService.sendMessage(
              chatId,
              `👋 Chào ${tenant.fullName}!\n\nTài khoản Telegram của bạn đã được liên kết trước đó.`,
            );
            return { ok: true };
          }

          // Link chatId to tenant
          console.log(`✅ Linking tenant ${tenant.fullName} to Telegram chat ${chatId}`);
          tenant.telegramChatId = chatId;
          tenant.telegramLinkedAt = new Date();
          await tenant.save();

          // Find latest bill (any status)
          const latestBill = await Bill.findOne({
            contractId: new Types.ObjectId(contractId),
          }).sort({ year: -1, month: -1 }).lean();

          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

          // Build welcome message with rules
          let msg = `✅ Liên kết Telegram thành công!\n\n`;
          msg += `👋 Chào mừng ${tenant.fullName}!\n\n`;
          msg += `📋 <b>QUY ĐỊNH NHÀ TRỌ</b>\n`;
          msg += `━━━━━━━━━━━━━━━━━━━━\n`;
          msg += `• Thanh toán tiền phòng trước ngày 5 hàng tháng\n`;
          msg += `• Giữ gìn vệ sinh chung\n`;
          msg += `• Không gây ồn ào sau 22h\n`;
          msg += `• Báo trước 30 ngày nếu muốn trả phòng\n`;
          msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

          if (latestBill) {
            const bill = latestBill as any;
            const remaining = bill.totalAmount - bill.paidAmount;
            const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
            const isPaid = bill.status === 'PAID';

            msg += `💰 <b>HOÁ ĐƠN GẦN NHẤT (T${bill.month}/${bill.year})</b>\n`;
            msg += `Trạng thái: ${isPaid ? '✅ Đã thanh toán' : '❌ Chưa thanh toán'}\n`;
            if (!isPaid) msg += `Còn lại: ${vnd(remaining)} VNĐ\n`;

            // Generate MoMo payment link (Always)
            try {
              const payment = await this.momoService.createPayment(
                bill._id.toString(),
                { ownerId: contract.ownerId.toString() } as any,
                true // Force generation
              );
              msg += `💳 <a href="${payment.payUrl}">Thanh toán qua MoMo</a>\n`;
            } catch (e: any) {
              console.error(`Could not generate MoMo link: ${e.message}`);
            }
            msg += `👉 <a href="${frontendUrl}/payment/${bill._id}">Xem chi tiết hoá đơn</a>\n`;
          } else {
            msg += `📅 Hoá đơn sẽ được gửi vào ngày 1 hàng tháng.\n`;
          }

          msg += `\n🔔 Bạn sẽ nhận thông báo hoá đơn tự động tại đây.`;

          await this.telegramService.sendMessage(chatId, msg);
          console.log('✅ Contract webhook processed successfully');
          return { ok: true };
        }

        // Unknown payload format
        console.log(`❌ Unknown payload format: ${payload}`);
        await this.telegramService.sendMessage(chatId, '❌ Liên kết không hợp lệ.');
      } else {
        // Handle other commands
        if (text === '/bill' || text.toLowerCase() === 'bill' || text.toLowerCase() === 'hoadon' || text === '/payLink' || text.toLowerCase() === 'paylink') {
          // Check if sender is a tenant
          const tenant = await this.tenantModel.findOne({ telegramChatId: chatId });
          if (tenant) {
            console.log(`🔍 Tenant ${tenant.fullName} requesting bill via ${text}`);

            // Find unpaid bills (latest first)
            // Need to find contracts for this tenant first
            const contracts = await this.tenantModel.db.model('Contract').find({ tenantId: tenant._id, status: 'ACTIVE' }).lean();
            const contractIds = contracts.map((c: any) => c._id);

            // Find latest bill (any status)
            const latestBill = await this.tenantModel.db.model('Bill').findOne({
              contractId: { $in: contractIds },
            }).sort({ year: -1, month: -1 }).lean();

            if (latestBill) {
              const bill = latestBill as any;
              const contract = contracts.find((c: any) => c._id.toString() === bill.contractId.toString());

              if (contract) {
                const remaining = bill.totalAmount - bill.paidAmount;
                const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n);
                const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
                const isPaid = bill.status === 'PAID';

                let msg = `💰 <b>HOÁ ĐƠN GẦN NHẤT (T${bill.month}/${bill.year})</b>\n`;
                msg += `Trạng thái: ${isPaid ? '✅ Đã thanh toán' : '❌ Chưa thanh toán'}\n`;
                if (!isPaid) msg += `Còn lại: ${vnd(remaining)} VNĐ\n`;

                // Generate MoMo payment link (Always)
                try {
                  const payment = await this.momoService.createPayment(
                    bill._id.toString(),
                    { ownerId: (contract as any).ownerId.toString() } as any,
                    true // Force generation
                  );
                  msg += `💳 <a href="${payment.payUrl}">Thanh toán qua MoMo</a>\n`;
                } catch (e: any) {
                  console.error(`Could not generate MoMo link for /bill command: ${e.message}`);
                }
                msg += `👉 <a href="${frontendUrl}/payment/${bill._id}">Xem chi tiết hoá đơn</a>`;

                await this.telegramService.sendMessage(chatId, msg);
              } else {
                await this.telegramService.sendMessage(chatId, '❌ Không tìm thấy thông tin hợp đồng của hoá đơn.');
              }
            } else {
              await this.telegramService.sendMessage(chatId, '✅ Bạn chưa có hoá đơn nào.');
            }
          } else {
            // Maybe owner?
            await this.telegramService.sendMessage(chatId, 'ℹ️ Vui lòng sử dụng tài khoản đã liên kết.');
          }
          return { ok: true };
        }

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
