import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { User, UserDocument } from '../users/users.schema';
import { RefreshToken, RefreshTokenDocument } from './auth.schema';
import { Otp, OtpDocument, OtpType } from './otp.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { VerifyChangePasswordOtpDto } from './dto/verify-change-password-otp.dto';
import { RequestForgotPasswordOtpDto, VerifyForgotPasswordOtpDto } from './dto/verify-forgot-password-otp.dto';
import { Role } from '../../common/enums/role.enum';
import { MailService } from '../mail/mail.service';
import { SubscriptionService } from '../subscription/subscription.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  user: {
    _id: Types.ObjectId;
    email: string;
    fullName: string;
    role: string;
    ownerId: Types.ObjectId;
  };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(RefreshToken.name)
    private readonly refreshTokenModel: Model<RefreshTokenDocument>,
    @InjectModel(Otp.name)
    private readonly otpModel: Model<OtpDocument>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async register(dto: RegisterDto): Promise<LoginResponse> {
    this.logger.log(`Register attempt – email: ${dto.email}, fullName: ${dto.fullName}, phone: ${dto.phone}`);

    const existing = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .lean();

    if (existing) {
      this.logger.warn(`Register failed – email already in use: ${dto.email}`);
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const verificationToken = randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    const user = new this.userModel({
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      fullName: dto.fullName,
      phone: dto.phone,
      role: Role.OWNER,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
      emailVerified: false,
      isOnboardingComplete: false,
    });

    // Owner's ownerId is their own _id
    user.ownerId = user._id as Types.ObjectId;
    await user.save();

    const userId = (user._id as Types.ObjectId).toString();
    this.logger.log(`Register success – userId: ${userId}, email: ${dto.email}, role: owner`);

    // Create free subscription for new user (fire-and-forget)
    this.subscriptionService.createFreeSubscription(userId)
      .catch((err) => this.logger.error(`Subscription creation error: ${(err as Error).message}`));

    // Send verification email (fire-and-forget)
    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3001');
    this.mailService.sendEmailVerification(user.email, {
      name: user.fullName,
      verifyUrl: `${frontendUrl}/verify-email?token=${verificationToken}`,
    }).catch((err) => this.logger.error(`Email verification send error: ${(err as Error).message}`));

    // Generate tokens so the frontend can auto-login after registration
    const tokens = await this.generateTokenPair(
      userId,
      user.role,
      user.ownerId?.toString() ?? '000000000000000000000000',
    );

    return {
      user: {
        _id: user._id as Types.ObjectId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        ownerId: user.ownerId,
      },
      tokens,
    };
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.userModel
      .findOne({ email: dto.email.toLowerCase() })
      .select('+password')
      .lean();

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const userId = (user._id as Types.ObjectId).toString();
    const tokens = await this.generateTokenPair(
      userId,
      user.role,
      user.ownerId?.toString() ?? '000000000000000000000000',
    );

    return {
      user: {
        _id: user._id as Types.ObjectId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        ownerId: user.ownerId,
      },
      tokens,
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.userModel.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Token xác thực không hợp lệ hoặc đã hết hạn');
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return { message: 'Email đã được xác thực thành công' };
  }

  async resendVerification(userId: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('Người dùng không tồn tại');
    if (user.emailVerified) throw new BadRequestException('Email đã được xác thực');

    const token = randomBytes(32).toString('hex');
    user.emailVerificationToken = token;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    const frontendUrl = this.configService.get<string>('frontendUrl', 'http://localhost:3001');
    await this.mailService.sendEmailVerification(user.email, {
      name: user.fullName,
      verifyUrl: `${frontendUrl}/verify-email?token=${token}`,
    });

    return { message: 'Email xác thực đã được gửi lại' };
  }

  async refreshTokens(token: string): Promise<TokenPair> {
    const storedToken = await this.refreshTokenModel.findOne({
      token,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotate: revoke old token
    storedToken.isRevoked = true;
    await storedToken.save();

    const user = await this.userModel.findById(storedToken.userId).lean();
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    const userId = (user._id as Types.ObjectId).toString();
    return this.generateTokenPair(userId, user.role, user.ownerId?.toString() ?? '000000000000000000000000');
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), isRevoked: false },
      { isRevoked: true },
    );
    return { message: 'Logged out successfully' };
  }

  // ─── OTP-based Registration ───────────────────────────────────────────────

  async requestRegisterOtp(dto: RegisterDto): Promise<{ message: string; email: string }> {
    const email = dto.email.toLowerCase().trim();
    this.logger.log(`Register OTP request – email: ${email}`);

    const existing = await this.userModel.findOne({ email }).lean();
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);
    const code = this.generateOtpCode();

    // Remove any previous OTP for this email + type
    await this.otpModel.deleteMany({ email, type: OtpType.REGISTER });

    await this.otpModel.create({
      email,
      code,
      type: OtpType.REGISTER,
      payload: {
        password: hashedPassword,
        fullName: dto.fullName,
        phone: dto.phone,
      },
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // Send OTP email
    await this.mailService.sendOtpEmail(email, {
      name: dto.fullName,
      code,
    });

    this.logger.log(`Register OTP sent to ${email}`);
    return { message: 'Mã OTP đã được gửi đến email của bạn', email };
  }

  async verifyRegisterOtp(dto: VerifyRegisterOtpDto): Promise<LoginResponse> {
    const email = dto.email.toLowerCase().trim();
    const otpDoc = await this.otpModel.findOne({
      email,
      type: OtpType.REGISTER,
      expiresAt: { $gt: new Date() },
    });

    if (!otpDoc) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    if (otpDoc.attempts >= 5) {
      await this.otpModel.deleteOne({ _id: otpDoc._id });
      throw new BadRequestException('Đã vượt quá số lần thử. Vui lòng yêu cầu mã mới.');
    }

    if (otpDoc.code !== dto.code) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      throw new BadRequestException(`Mã OTP không đúng. Còn ${5 - otpDoc.attempts} lần thử.`);
    }

    // OTP valid — create the user
    const payload = otpDoc.payload;
    const user = new this.userModel({
      email,
      password: payload.password,
      fullName: payload.fullName,
      phone: payload.phone,
      role: Role.OWNER,
      emailVerified: true, // Verified via OTP
      isOnboardingComplete: false,
    });
    user.ownerId = user._id as Types.ObjectId;
    await user.save();

    // Cleanup OTP
    await this.otpModel.deleteOne({ _id: otpDoc._id });

    const userId = (user._id as Types.ObjectId).toString();
    this.logger.log(`Register via OTP success – userId: ${userId}, email: ${email}`);

    // Create free subscription (fire-and-forget)
    this.subscriptionService.createFreeSubscription(userId)
      .catch((err) => this.logger.error(`Subscription creation error: ${(err as Error).message}`));

    // Generate tokens
    const tokens = await this.generateTokenPair(
      userId,
      user.role,
      user.ownerId?.toString() ?? '000000000000000000000000',
    );

    return {
      user: {
        _id: user._id as Types.ObjectId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        ownerId: user.ownerId,
      },
      tokens,
    };
  }

  // ─── OTP-based Change Password ──────────────────────────────────────────

  async requestChangePasswordOtp(userId: string): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) throw new BadRequestException('Người dùng không tồn tại');

    const code = this.generateOtpCode();

    // Remove any previous OTP for this email + type
    await this.otpModel.deleteMany({ email: user.email, type: OtpType.CHANGE_PASSWORD });

    await this.otpModel.create({
      email: user.email,
      code,
      type: OtpType.CHANGE_PASSWORD,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await this.mailService.sendOtpEmail(user.email, {
      name: user.fullName,
      code,
    });

    this.logger.log(`Change-password OTP sent to ${user.email}`);
    return { message: 'Mã OTP đã được gửi đến email của bạn' };
  }

  async verifyChangePasswordOtp(
    userId: string,
    dto: VerifyChangePasswordOtpDto,
  ): Promise<{ message: string }> {
    const user = await this.userModel.findById(userId).select('+password');
    if (!user) throw new BadRequestException('Người dùng không tồn tại');

    const otpDoc = await this.otpModel.findOne({
      email: user.email,
      type: OtpType.CHANGE_PASSWORD,
      expiresAt: { $gt: new Date() },
    });

    if (!otpDoc) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    if (otpDoc.attempts >= 5) {
      await this.otpModel.deleteOne({ _id: otpDoc._id });
      throw new BadRequestException('Đã vượt quá số lần thử. Vui lòng yêu cầu mã mới.');
    }

    if (otpDoc.code !== dto.code) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      throw new BadRequestException(`Mã OTP không đúng. Còn ${5 - otpDoc.attempts} lần thử.`);
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isPasswordValid) {
      await this.otpModel.deleteOne({ _id: otpDoc._id });
      throw new UnauthorizedException('Mật khẩu hiện tại không đúng');
    }

    // Update password
    user.password = await bcrypt.hash(dto.newPassword, 12);
    await user.save();

    // Cleanup OTP
    await this.otpModel.deleteOne({ _id: otpDoc._id });

    this.logger.log(`Password changed via OTP – userId: ${userId}`);
    return { message: 'Đổi mật khẩu thành công' };
  }

  // ─── OTP-based Forgot Password ───────────────────────────────────────────

  async requestForgotPasswordOtp(dto: RequestForgotPasswordOtpDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();

    const user = await this.userModel.findOne({ email }).lean();

    if (!user) {
      throw new BadRequestException('Email không tồn tại trong hệ thống');
    }

    const code = this.generateOtpCode();

    await this.otpModel.deleteMany({ email, type: OtpType.FORGOT_PASSWORD });

    await this.otpModel.create({
      email,
      code,
      type: OtpType.FORGOT_PASSWORD,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await this.mailService.sendOtpEmail(email, {
      name: user.fullName,
      code,
    });

    this.logger.log(`Forgot-password OTP sent to ${email}`);
    return { message: 'Mã OTP đã được gửi đến email của bạn' };
  }

  async verifyForgotPasswordOtp(dto: VerifyForgotPasswordOtpDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();

    const otpDoc = await this.otpModel.findOne({
      email,
      type: OtpType.FORGOT_PASSWORD,
      expiresAt: { $gt: new Date() },
    });

    if (!otpDoc) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    if (otpDoc.attempts >= 5) {
      await this.otpModel.deleteOne({ _id: otpDoc._id });
      throw new BadRequestException('Đã vượt quá số lần thử. Vui lòng yêu cầu mã mới.');
    }

    if (otpDoc.code !== dto.code) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      throw new BadRequestException(`Mã OTP không đúng. Còn ${5 - otpDoc.attempts} lần thử.`);
    }

    // OTP valid — update password
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new BadRequestException('Người dùng không tồn tại');
    }

    user.password = await bcrypt.hash(dto.newPassword, 12);
    await user.save();

    await this.otpModel.deleteOne({ _id: otpDoc._id });

    this.logger.log(`Password reset via OTP – email: ${email}`);
    return { message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập.' };
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async generateTokenPair(
    userId: string,
    role: string,
    ownerId: string,
  ): Promise<TokenPair> {
    const payload = { sub: userId, role, ownerId };

    const expiresIn = this.configService.get<string>('jwt.accessExpiresIn', '1d');
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.getOrThrow<string>('jwt.secret'),
      expiresIn: this.parseExpiry(expiresIn) / 1000, // seconds
    });

    const refreshToken = randomBytes(64).toString('hex');

    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
      '7d',
    );
    const expiresMs = this.parseExpiry(refreshExpiresIn);

    await this.refreshTokenModel.create({
      token: refreshToken,
      userId: new Types.ObjectId(userId),
      expiresAt: new Date(Date.now() + expiresMs),
    });

    return { accessToken, refreshToken };
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return value * (multipliers[unit] || 7 * 24 * 60 * 60 * 1000);
  }
}
