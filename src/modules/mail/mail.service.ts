import { Injectable, Logger } from '@nestjs/common';

export interface BillNotificationContext {
  tenantName: string;
  month: number;
  year: number;
  roomName: string;
  roomPrice: number;
  electricCost: number;
  waterCost: number;
  otherFee: number;
  totalAmount: number;
  paidAmount: number;
  dueDate?: string;
  portalUrl?: string;
}

export interface PaymentConfirmationContext {
  tenantName: string;
  amount: number;
  method: string;
  month: number;
  year: number;
  paidAt: string;
  remainingAmount: number;
  isPaid: boolean;
}

export interface EmailVerificationContext {
  name: string;
  verifyUrl: string;
}

export interface OtpEmailContext {
  name: string;
  code: string;
}

export interface TenantActivationContext {
  tenantName: string;
  activationLink: string;
  expiresIn: string;
}

export interface ContractEmailContext {
  tenantName: string;
  propertyName: string;
  propertyAddress: string;
  roomName: string;
  roomArea?: number;
  startDate: string;
  endDate: string;
  rentPrice: number;
  deposit: number;
  telegramLink: string;
  portalUrl?: string;
}

export interface ContractWithPasswordContext extends ContractEmailContext {
  email: string;
  initialPassword: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly configured: boolean;

  constructor() {
    this.apiKey = process.env.API_RESEND ?? '';
    this.from = process.env.MAIL_FROM ?? 'Rental SaaS <noreply@rental.local>';
    this.configured = !!this.apiKey;

    if (!this.configured) {
      this.logger.warn('Mail service not configured — emails will be skipped. Set API_RESEND.');
    }
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.configured) {
      this.logger.debug(`[Mail skipped] To: ${to} | Subject: ${subject}`);
      return;
    }

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, html }),
      });

      if (!res.ok) {
        const body = await res.text();
        this.logger.error(`[Mail error] To: ${to} | HTTP ${res.status}: ${body}`);
        return;
      }

      this.logger.debug(`[Mail sent] To: ${to} | Subject: ${subject}`);
    } catch (error) {
      this.logger.error(`[Mail error] To: ${to} | ${(error as Error).message}`);
    }
  }

  async sendBillNotification(to: string, ctx: BillNotificationContext): Promise<void> {
    if (!to) return;
    const html = billNotificationTemplate(ctx);
    await this.send(to, `Hóa đơn tháng ${ctx.month}/${ctx.year} - ${ctx.roomName}`, html);
  }

  async sendPaymentConfirmation(to: string, ctx: PaymentConfirmationContext): Promise<void> {
    if (!to) return;
    const html = paymentConfirmationTemplate(ctx);
    await this.send(to, `Xác nhận thanh toán hóa đơn tháng ${ctx.month}/${ctx.year}`, html);
  }

  async sendEmailVerification(to: string, ctx: EmailVerificationContext): Promise<void> {
    if (!to) return;
    const html = emailVerificationTemplate(ctx);
    await this.send(to, 'Xác thực email — RentalSaaS', html);
  }

  async sendOtpEmail(to: string, ctx: OtpEmailContext): Promise<void> {
    if (!to) return;
    const html = otpEmailTemplate(ctx);
    await this.send(to, `Mã xác thực OTP — RentalSaaS`, html);
  }

  async sendTenantActivation(to: string, ctx: TenantActivationContext): Promise<void> {
    if (!to) return;
    const html = tenantActivationTemplate(ctx);
    await this.send(to, `Kích hoạt tài khoản khách thuê — RentalSaaS`, html);
  }

  async sendContractCreated(to: string, ctx: ContractEmailContext): Promise<void> {
    if (!to) return;
    const html = contractCreatedTemplate(ctx);
    await this.send(to, `Hợp đồng thuê phòng ${ctx.roomName} — ${ctx.propertyName}`, html);
  }

  async sendContractWithPassword(to: string, ctx: ContractWithPasswordContext): Promise<void> {
    if (!to) return;
    const html = contractWithPasswordTemplate(ctx);
    await this.send(to, `Hợp đồng thuê phòng ${ctx.roomName} — Tài khoản đăng nhập`, html);
  }
}

// ─── HTML Templates ──────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}

function billNotificationTemplate(ctx: BillNotificationContext): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Hóa đơn tháng ${ctx.month}/${ctx.year}</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
  <div style="background:#4F46E5;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Hóa đơn tiền phòng</h1>
    <p style="color:#C7D2FE;margin:8px 0 0;">Tháng ${ctx.month}/${ctx.year}</p>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
    <p style="color:#374151;">Xin chào <strong>${ctx.tenantName}</strong>,</p>
    <p style="color:#6B7280;">Hóa đơn tiền phòng <strong>${ctx.roomName}</strong> tháng ${ctx.month}/${ctx.year} đã được tạo.</p>

    <table style="width:100%;border-collapse:collapse;margin:24px 0;">
      <tr style="background:#F3F4F6;">
        <th style="padding:10px;text-align:left;color:#374151;">Khoản mục</th>
        <th style="padding:10px;text-align:right;color:#374151;">Số tiền</th>
      </tr>
      <tr><td style="padding:10px;border-bottom:1px solid #E5E7EB;">Tiền phòng</td><td style="padding:10px;text-align:right;border-bottom:1px solid #E5E7EB;">${fmt(ctx.roomPrice)}</td></tr>
      <tr><td style="padding:10px;border-bottom:1px solid #E5E7EB;">Tiền điện</td><td style="padding:10px;text-align:right;border-bottom:1px solid #E5E7EB;">${fmt(ctx.electricCost)}</td></tr>
      <tr><td style="padding:10px;border-bottom:1px solid #E5E7EB;">Tiền nước</td><td style="padding:10px;text-align:right;border-bottom:1px solid #E5E7EB;">${fmt(ctx.waterCost)}</td></tr>
      ${ctx.otherFee > 0 ? `<tr><td style="padding:10px;border-bottom:1px solid #E5E7EB;">Phí khác</td><td style="padding:10px;text-align:right;border-bottom:1px solid #E5E7EB;">${fmt(ctx.otherFee)}</td></tr>` : ''}
      <tr style="background:#EEF2FF;font-weight:bold;">
        <td style="padding:12px;">Tổng cộng</td>
        <td style="padding:12px;text-align:right;color:#4F46E5;">${fmt(ctx.totalAmount)}</td>
      </tr>
    </table>

    ${ctx.dueDate ? `<p style="color:#6B7280;">⏰ Hạn thanh toán: <strong>${ctx.dueDate}</strong></p>` : ''}

    ${ctx.portalUrl ? `
    <div style="text-align:center;margin-top:32px;">
      <a href="${ctx.portalUrl}" style="background:#4F46E5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Xem hóa đơn &amp; Thanh toán</a>
    </div>` : ''}
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">Rental SaaS — Hệ thống quản lý cho thuê</p>
</body>
</html>`;
}

function paymentConfirmationTemplate(ctx: PaymentConfirmationContext): string {
  const methodLabels: Record<string, string> = {
    CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản', MOMO: 'MoMo', VNPAY: 'VNPay', OTHER: 'Khác',
  };
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Xác nhận thanh toán</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
  <div style="background:#16A34A;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">✅ Thanh toán thành công</h1>
    <p style="color:#BBF7D0;margin:8px 0 0;">Tháng ${ctx.month}/${ctx.year}</p>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
    <p>Xin chào <strong>${ctx.tenantName}</strong>,</p>
    <p>Chúng tôi xác nhận đã nhận được thanh toán của bạn.</p>

    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:4px 0;">💰 Số tiền đã thanh toán: <strong style="color:#16A34A;">${fmt(ctx.amount)}</strong></p>
      <p style="margin:4px 0;">💳 Phương thức: <strong>${methodLabels[ctx.method] ?? ctx.method}</strong></p>
      <p style="margin:4px 0;">📅 Ngày thanh toán: <strong>${ctx.paidAt}</strong></p>
    </div>

    ${ctx.isPaid
      ? `<p style="color:#16A34A;font-weight:bold;">✅ Hóa đơn tháng ${ctx.month}/${ctx.year} đã được thanh toán đầy đủ.</p>`
      : `<p style="color:#D97706;">⚠️ Số tiền còn lại cần thanh toán: <strong>${fmt(ctx.remainingAmount)}</strong></p>`
    }
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">Rental SaaS</p>
</body>
</html>`;
}

function emailVerificationTemplate(ctx: EmailVerificationContext): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Xác thực email</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
  <div style="background:#4F46E5;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Xác thực email của bạn</h1>
    <p style="color:#C7D2FE;margin:8px 0 0;">RentalSaaS</p>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
    <p>Xin chào <strong>${ctx.name}</strong>,</p>
    <p style="color:#6B7280;">Nhấn nút bên dưới để xác thực địa chỉ email của bạn. Liên kết có hiệu lực trong <strong>24 giờ</strong>.</p>
    <div style="text-align:center;margin-top:32px;">
      <a href="${ctx.verifyUrl}" style="background:#4F46E5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Xác thực Email</a>
    </div>
    <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Nếu bạn không đăng ký tài khoản, hãy bỏ qua email này.</p>
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">RentalSaaS — Hệ thống quản lý cho thuê</p>
</body>
</html>`;
}

function otpEmailTemplate(ctx: OtpEmailContext): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><title>Mã xác thực OTP</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
  <div style="background:#4F46E5;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Mã xác thực OTP</h1>
    <p style="color:#C7D2FE;margin:8px 0 0;">RentalSaaS</p>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
    <p>Xin chào <strong>${ctx.name}</strong>,</p>
    <p style="color:#6B7280;">Mã xác thực của bạn là:</p>
    <div style="text-align:center;margin:24px 0;">
      <div style="display:inline-block;background:#EEF2FF;border:2px solid #4F46E5;border-radius:12px;padding:16px 32px;letter-spacing:8px;font-size:32px;font-weight:bold;color:#4F46E5;">${ctx.code}</div>
    </div>
    <p style="color:#6B7280;text-align:center;">Mã có hiệu lực trong <strong>5 phút</strong>. Không chia sẻ mã này với bất kỳ ai.</p>
    <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này.</p>
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">RentalSaaS — Hệ thống quản lý cho thuê</p>
</body>
</html>`;
}

function contractCreatedTemplate(ctx: ContractEmailContext): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Hợp đồng thuê phòng</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
  <div style="background:#4F46E5;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Hợp đồng thuê phòng</h1>
    <p style="color:#C7D2FE;margin:8px 0 0;">Thông tin hợp đồng của bạn</p>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
    <p style="color:#374151;">Xin chào <strong>${ctx.tenantName}</strong>,</p>
    <p style="color:#6B7280;">Hợp đồng thuê phòng của bạn đã được tạo thành công. Dưới đây là thông tin chi tiết:</p>

    <div style="background:#F5F3FF;border-left:4px solid #4F46E5;padding:20px;margin:20px 0;border-radius:0 8px 8px 0;">
      <h3 style="margin:0 0 12px;color:#4F46E5;font-size:16px;">Thông tin nhà trọ</h3>
      <p style="margin:4px 0;color:#374151;">🏢 Nhà trọ: <strong>${ctx.propertyName}</strong></p>
      <p style="margin:4px 0;color:#374151;">📍 Địa chỉ: <strong>${ctx.propertyAddress}</strong></p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#F3F4F6;">
        <th style="padding:12px;text-align:left;color:#374151;border-bottom:2px solid #E5E7EB;" colspan="2">Chi tiết hợp đồng</th>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">🏠 Phòng</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${ctx.roomName}${ctx.roomArea ? ` (${ctx.roomArea} m²)` : ''}</td>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">📅 Ngày bắt đầu</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${ctx.startDate}</td>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">📅 Ngày kết thúc</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${ctx.endDate}</td>
      </tr>
      <tr style="background:#EEF2FF;">
        <td style="padding:12px;font-weight:bold;color:#374151;">💰 Giá thuê / tháng</td>
        <td style="padding:12px;text-align:right;font-weight:bold;color:#4F46E5;font-size:18px;">${fmt(ctx.rentPrice)}</td>
      </tr>
      ${ctx.deposit > 0 ? `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">🔒 Tiền đặt cọc</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${fmt(ctx.deposit)}</td>
      </tr>` : ''}
    </table>

    <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 8px;color:#065F46;font-weight:bold;">📱 Nhận thông báo qua Telegram</p>
      <p style="margin:0 0 16px;color:#6B7280;font-size:13px;">Kết nối Telegram để nhận thông báo hóa đơn, nhắc thanh toán nhanh chóng.</p>
      <a href="${ctx.telegramLink}" style="background:#0088cc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Kết nối Telegram</a>
    </div>

    ${ctx.portalUrl ? `
    <div style="text-align:center;margin-top:24px;">
      <a href="${ctx.portalUrl}" style="background:#4F46E5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Truy cập cổng khách thuê</a>
    </div>` : ''}

    <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Nếu bạn có thắc mắc, vui lòng liên hệ chủ nhà trọ để được hỗ trợ.</p>
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">Rental SaaS — Hệ thống quản lý cho thuê</p>
</body>
</html>`;
}

function tenantActivationTemplate(ctx: TenantActivationContext): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Kích hoạt tài khoản</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
  <div style="background:#4F46E5;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Kích hoạt tài khoản</h1>
    <p style="color:#C7D2FE;margin:8px 0 0;">Cổng thông tin khách thuê</p>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
    <p style="color:#374151;">Xin chào <strong>${ctx.tenantName}</strong>,</p>
    <p style="color:#6B7280;">Bạn đã được tạo tài khoản trên hệ thống quản lý thuê trọ. Nhấn nút bên dưới để đặt mật khẩu và kích hoạt tài khoản:</p>

    <div style="text-align:center;margin:32px 0;">
      <a href="${ctx.activationLink}" style="background:#4F46E5;color:#fff;padding:16px 40px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:16px;">Kích hoạt tài khoản</a>
    </div>

    <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:0;color:#92400E;font-size:13px;">⏰ Liên kết có hiệu lực trong <strong>${ctx.expiresIn}</strong>. Sau khi hết hạn, vui lòng liên hệ chủ trọ để gửi lại.</p>
    </div>

    <p style="color:#6B7280;font-size:13px;">Sau khi kích hoạt, bạn có thể đăng nhập bằng email và mật khẩu để:</p>
    <ul style="color:#6B7280;font-size:13px;padding-left:20px;">
      <li>Xem hóa đơn hàng tháng</li>
      <li>Thanh toán trực tuyến</li>
      <li>Xem lịch sử thanh toán</li>
    </ul>

    <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Nếu bạn không yêu cầu tạo tài khoản, hãy bỏ qua email này.</p>
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">Rental SaaS — Hệ thống quản lý cho thuê</p>
</body>
</html>`;
}

function contractWithPasswordTemplate(ctx: ContractWithPasswordContext): string {
  return `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Hợp đồng thuê phòng & Tài khoản đăng nhập</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;">
  <div style="background:#4F46E5;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">Hợp đồng thuê phòng</h1>
    <p style="color:#C7D2FE;margin:8px 0 0;">Thông tin hợp đồng & tài khoản đăng nhập</p>
  </div>
  <div style="background:#fff;padding:32px;border-radius:0 0 8px 8px;">
    <p style="color:#374151;">Xin chào <strong>${ctx.tenantName}</strong>,</p>
    <p style="color:#6B7280;">Hợp đồng thuê phòng của bạn đã được tạo thành công.</p>

    <div style="background:#F5F3FF;border-left:4px solid #4F46E5;padding:20px;margin:20px 0;border-radius:0 8px 8px 0;">
      <h3 style="margin:0 0 12px;color:#4F46E5;font-size:16px;">Thông tin nhà trọ</h3>
      <p style="margin:4px 0;color:#374151;">🏢 Nhà trọ: <strong>${ctx.propertyName}</strong></p>
      <p style="margin:4px 0;color:#374151;">📍 Địa chỉ: <strong>${ctx.propertyAddress}</strong></p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr style="background:#F3F4F6;">
        <th style="padding:12px;text-align:left;color:#374151;border-bottom:2px solid #E5E7EB;" colspan="2">Chi tiết hợp đồng</th>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">🏠 Phòng</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${ctx.roomName}${ctx.roomArea ? ` (${ctx.roomArea} m²)` : ''}</td>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">📅 Ngày bắt đầu</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${ctx.startDate}</td>
      </tr>
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">📅 Ngày kết thúc</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${ctx.endDate}</td>
      </tr>
      <tr style="background:#EEF2FF;">
        <td style="padding:12px;font-weight:bold;color:#374151;">💰 Giá thuê / tháng</td>
        <td style="padding:12px;text-align:right;font-weight:bold;color:#4F46E5;font-size:18px;">${fmt(ctx.rentPrice)}</td>
      </tr>
      ${ctx.deposit > 0 ? `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;color:#6B7280;">🔒 Tiền đặt cọc</td>
        <td style="padding:10px;border-bottom:1px solid #E5E7EB;text-align:right;font-weight:bold;color:#374151;">${fmt(ctx.deposit)}</td>
      </tr>` : ''}
    </table>

    <div style="background:#DBEAFE;border:2px solid #3B82F6;border-radius:8px;padding:20px;margin:24px 0;">
      <h3 style="margin:0 0 12px;color:#1E40AF;font-size:16px;">🔑 Tài khoản cổng khách thuê</h3>
      <p style="margin:6px 0;color:#1E3A5F;">Bạn có thể đăng nhập cổng khách thuê để xem hóa đơn, thanh toán trực tuyến:</p>
      <table style="width:100%;margin:12px 0;">
        <tr>
          <td style="padding:8px;color:#6B7280;width:120px;">📧 Email:</td>
          <td style="padding:8px;font-weight:bold;color:#1E40AF;">${ctx.email}</td>
        </tr>
        <tr>
          <td style="padding:8px;color:#6B7280;">🔒 Mật khẩu:</td>
          <td style="padding:8px;font-weight:bold;color:#1E40AF;font-family:monospace;font-size:18px;letter-spacing:2px;">${ctx.initialPassword}</td>
        </tr>
      </table>
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:6px;padding:12px;margin-top:8px;">
        <p style="margin:0;color:#92400E;font-size:13px;">⚠️ Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu. Nếu quên mật khẩu, sử dụng chức năng <strong>"Quên mật khẩu"</strong> trên trang đăng nhập.</p>
      </div>
    </div>

    ${ctx.portalUrl ? `
    <div style="text-align:center;margin-top:24px;">
      <a href="${ctx.portalUrl}/login" style="background:#4F46E5;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;font-size:16px;">Đăng nhập cổng khách thuê</a>
    </div>` : ''}

    <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
      <p style="margin:0 0 8px;color:#065F46;font-weight:bold;">📱 Nhận thông báo qua Telegram</p>
      <p style="margin:0 0 16px;color:#6B7280;font-size:13px;">Kết nối Telegram để nhận thông báo hóa đơn, nhắc thanh toán nhanh chóng.</p>
      <a href="${ctx.telegramLink}" style="background:#0088cc;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">Kết nối Telegram</a>
    </div>

    <p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Nếu bạn có thắc mắc, vui lòng liên hệ chủ nhà trọ để được hỗ trợ.</p>
  </div>
  <p style="text-align:center;color:#9CA3AF;font-size:12px;margin-top:16px;">Rental SaaS — Hệ thống quản lý cho thuê</p>
</body>
</html>`;
}
