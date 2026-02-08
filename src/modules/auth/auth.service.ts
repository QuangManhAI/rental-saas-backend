import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { User, UserDocument } from '../users/users.schema';
import { RefreshToken, RefreshTokenDocument } from './auth.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '../../common/enums/role.enum';

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
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

    const user = new this.userModel({
      email: dto.email.toLowerCase(),
      password: hashedPassword,
      fullName: dto.fullName,
      phone: dto.phone,
      role: Role.OWNER,
    });

    // Owner's ownerId is their own _id
    user.ownerId = user._id as Types.ObjectId;
    await user.save();

    const userId = (user._id as Types.ObjectId).toString();
    this.logger.log(`Register success – userId: ${userId}, email: ${dto.email}, role: owner`);

    // Generate tokens so the frontend can auto-login after registration
    const tokens = await this.generateTokenPair(
      userId,
      user.role,
      user.ownerId.toString(),
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
      user.ownerId.toString(),
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
    return this.generateTokenPair(userId, user.role, user.ownerId.toString());
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.refreshTokenModel.updateMany(
      { userId: new Types.ObjectId(userId), isRevoked: false },
      { isRevoked: true },
    );
    return { message: 'Logged out successfully' };
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
