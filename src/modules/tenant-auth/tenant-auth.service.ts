import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { TenantToken, TenantTokenDocument } from './tenant-token.schema';
import { Tenant, TenantDocument } from '../tenants/tenants.schema';
import { Otp, OtpDocument, OtpType } from '../auth/otp.schema';
import { MailService } from '../mail/mail.service';
import {
  ActivateAccountDto,
  TenantLoginDto,
  TenantRequestForgotPasswordDto,
  TenantVerifyForgotPasswordDto,
} from './dto/tenant-auth.dto';

export interface TenantPayload {
  tenantId: string;
  ownerId: string;
  role: 'tenant';
}

@Injectable()
export class TenantAuthService {
  private readonly logger = new Logger(TenantAuthService.name);
  private readonly frontendUrl: string;
  private readonly tenantJwtSecret: string;

  constructor(
    @InjectModel(TenantToken.name)
    private readonly tokenModel: Model<TenantTokenDocument>,
    @InjectModel(Tenant.name)
    private readonly tenantModel: Model<TenantDocument>,
    @InjectModel(Otp.name)
    private readonly otpModel: Model<OtpDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.frontendUrl = configService.get<string>('frontendUrl') || 'http://localhost:3001';
    this.tenantJwtSecret = configService.getOrThrow<string>('tenantJwt.secret');
  }

  private signTenantJwt(payload: TenantPayload): string {
    return this.jwtService.sign(payload, { secret: this.tenantJwtSecret });
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ─── Activation ──────────────────────────────────────────────

  async activateAccount(dto: ActivateAccountDto): Promise<{ accessToken: string; mustChangePassword: boolean; tenant: Partial<Tenant> }> {
    const tenant = await this.tenantModel.findOne({
      activationToken: dto.token,
      isActivated: false,
    });

    if (!tenant) {
      throw new BadRequestException('Liên kết kích hoạt không hợp lệ hoặc đã được sử dụng');
    }

    if (tenant.activationTokenExpiresAt && tenant.activationTokenExpiresAt < new Date()) {
      throw new BadRequestException('Liên kết kích hoạt đã hết hạn. Vui lòng liên hệ chủ trọ để gửi lại.');
    }

    tenant.password = await bcrypt.hash(dto.password, 12);
    tenant.isActivated = true;
    tenant.activationToken = null;
    tenant.activationTokenExpiresAt = null;
    tenant.mustChangePassword = true;
    await tenant.save();

    this.logger.log(`Tenant activated: ${tenant.email} (${tenant._id})`);

    const payload: TenantPayload = {
      tenantId: tenant._id.toString(),
      ownerId: tenant.ownerId.toString(),
      role: 'tenant',
    };

    return {
      accessToken: this.signTenantJwt(payload),
      mustChangePassword: true,
      tenant: {
        fullName: tenant.fullName,
        email: tenant.email,
        phone: tenant.phone,
      },
    };
  }

  // ─── Login ───────────────────────────────────────────────────

  async login(dto: TenantLoginDto): Promise<{ accessToken: string; mustChangePassword: boolean; tenant: Partial<Tenant> }> {
    const tenant = await this.tenantModel.findOne({ email: dto.email }).exec();

    if (!tenant || !tenant.password) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    if (!tenant.isActivated) {
      throw new UnauthorizedException('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.');
    }

    const isMatch = await bcrypt.compare(dto.password, tenant.password);
    if (!isMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    this.logger.log(`Tenant login: ${tenant.email}`);

    const payload: TenantPayload = {
      tenantId: tenant._id.toString(),
      ownerId: tenant.ownerId.toString(),
      role: 'tenant',
    };

    return {
      accessToken: this.signTenantJwt(payload),
      mustChangePassword: tenant.mustChangePassword ?? false,
      tenant: {
        fullName: tenant.fullName,
        email: tenant.email,
        phone: tenant.phone,
      },
    };
  }

  // ─── Change Initial Password ─────────────────────────────────

  async changeInitialPassword(tenantId: string, newPassword: string): Promise<{ message: string }> {
    const tenant = await this.tenantModel.findById(tenantId);
    if (!tenant || !tenant.isActivated) {
      throw new NotFoundException('Tài khoản không tồn tại');
    }

    tenant.password = await bcrypt.hash(newPassword, 12);
    tenant.mustChangePassword = false;
    await tenant.save();

    this.logger.log(`Tenant changed initial password: ${tenant.email}`);
    return { message: 'Mật khẩu đã được cập nhật thành công' };
  }

  // ─── Forgot Password ────────────────────────────────────────

  async requestForgotPassword(dto: TenantRequestForgotPasswordDto): Promise<{ message: string }> {
    const tenant = await this.tenantModel.findOne({ email: dto.email, isActivated: true }).lean();

    // Prevent email enumeration — always return success message
    if (!tenant) {
      return { message: 'Nếu email tồn tại, mã OTP sẽ được gửi' };
    }

    await this.otpModel.deleteMany({ email: dto.email, type: OtpType.TENANT_FORGOT_PASSWORD });

    const code = this.generateOtpCode();
    await this.otpModel.create({
      email: dto.email,
      code,
      type: OtpType.TENANT_FORGOT_PASSWORD,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0,
    });

    await this.mailService.sendOtpEmail(dto.email, {
      name: tenant.fullName,
      code,
    });

    this.logger.log(`Tenant forgot-password OTP sent to ${dto.email}`);
    return { message: 'Mã OTP đã được gửi đến email của bạn' };
  }

  async verifyForgotPassword(dto: TenantVerifyForgotPasswordDto): Promise<{ message: string }> {
    const otp = await this.otpModel.findOne({
      email: dto.email,
      type: OtpType.TENANT_FORGOT_PASSWORD,
    });

    if (!otp) {
      throw new BadRequestException('Mã OTP không tồn tại hoặc đã hết hạn');
    }

    if (otp.expiresAt < new Date()) {
      await otp.deleteOne();
      throw new BadRequestException('Mã OTP đã hết hạn');
    }

    if (otp.attempts >= 5) {
      await otp.deleteOne();
      throw new BadRequestException('Đã vượt quá số lần thử. Vui lòng yêu cầu mã mới.');
    }

    if (otp.code !== dto.code) {
      otp.attempts += 1;
      await otp.save();
      throw new BadRequestException('Mã OTP không đúng');
    }

    const tenant = await this.tenantModel.findOne({ email: dto.email, isActivated: true });
    if (!tenant) {
      throw new NotFoundException('Tài khoản không tồn tại');
    }

    tenant.password = await bcrypt.hash(dto.newPassword, 12);
    await tenant.save();
    await otp.deleteOne();

    this.logger.log(`Tenant password reset: ${dto.email}`);
    return { message: 'Mật khẩu đã được đặt lại thành công' };
  }

  // ─── Magic-link (deprecated, kept for backward compat) ──────

  /** @deprecated Use activateAccount + login instead */
  async generateLink(tenantId: string, ownerId: string): Promise<{ link: string; expiresAt: Date }> {
    const tenant = await this.tenantModel
      .findOne({ _id: new Types.ObjectId(tenantId), ownerId: new Types.ObjectId(ownerId) })
      .lean()
      .exec();

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    await this.tokenModel.deleteMany({
      tenantId: new Types.ObjectId(tenantId),
      usedAt: null,
    });

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.tokenModel.create({
      token,
      tenantId: new Types.ObjectId(tenantId),
      ownerId: new Types.ObjectId(ownerId),
      expiresAt,
    });

    const link = `${this.frontendUrl}/tenant/login?code=${token}`;
    return { link, expiresAt };
  }

  /** @deprecated Use login instead */
  async verifyToken(token: string): Promise<{ accessToken: string; tenant: Partial<Tenant> }> {
    const record = await this.tokenModel.findOne({ token }).lean().exec();

    if (!record) {
      throw new UnauthorizedException('Invalid or expired login link');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Login link has expired');
    }

    if (record.usedAt) {
      throw new UnauthorizedException('Login link has already been used');
    }

    await this.tokenModel.updateOne({ _id: record._id }, { usedAt: new Date() });

    const tenant = await this.tenantModel.findById(record.tenantId).lean().exec();
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const payload: TenantPayload = {
      tenantId: record.tenantId.toString(),
      ownerId: record.ownerId.toString(),
      role: 'tenant',
    };

    return {
      accessToken: this.signTenantJwt(payload),
      tenant: {
        fullName: tenant.fullName,
        email: tenant.email,
        phone: tenant.phone,
      },
    };
  }

  // ─── Shared ─────────────────────────────────────────────────

  async refreshToken(tenantId: string, ownerId: string): Promise<{ accessToken: string }> {
    const tenant = await this.tenantModel.findById(tenantId).lean().exec();
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const payload: TenantPayload = { tenantId, ownerId, role: 'tenant' };
    return { accessToken: this.signTenantJwt(payload) };
  }

  async getProfile(tenantId: string): Promise<TenantDocument | null> {
    return this.tenantModel.findById(tenantId).select('-password -activationToken').lean().exec();
  }

  async revokeTokens(tenantId: string): Promise<void> {
    await this.tokenModel.deleteMany({ tenantId: new Types.ObjectId(tenantId) });
  }

  async getActiveLink(tenantId: string, ownerId: string): Promise<{ link: string; expiresAt: Date } | null> {
    const record = await this.tokenModel
      .findOne({
        tenantId: new Types.ObjectId(tenantId),
        ownerId: new Types.ObjectId(ownerId),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .lean()
      .exec();

    if (!record) return null;
    return {
      link: `${this.frontendUrl}/tenant/login?code=${record.token}`,
      expiresAt: record.expiresAt,
    };
  }
}
