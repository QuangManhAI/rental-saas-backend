import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantJwtGuard } from '../../common/guards/tenant-jwt.guard';
import { TenantAuthService } from './tenant-auth.service';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import {
  ActivateAccountDto,
  TenantLoginDto,
  TenantRequestForgotPasswordDto,
  TenantVerifyForgotPasswordDto,
} from './dto/tenant-auth.dto';

class GenerateLinkDto {
  @IsMongoId()
  tenantId: string;
}

class VerifyTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

@Controller('tenant-auth')
export class TenantAuthController {
  constructor(private readonly tenantAuthService: TenantAuthService) {}

  // ─── New: Password-based auth ────────────────────────────────

  /**
   * POST /tenant-auth/activate
   * Public — tenant sets password from activation link.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  async activateAccount(@Body() dto: ActivateAccountDto) {
    return this.tenantAuthService.activateAccount(dto);
  }

  /**
   * POST /tenant-auth/login
   * Public — tenant logs in with email + password.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: TenantLoginDto) {
    return this.tenantAuthService.login(dto);
  }

  /**
   * POST /tenant-auth/forgot-password/request-otp
   * Public — tenant requests OTP for password reset.
   */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password/request-otp')
  @HttpCode(HttpStatus.OK)
  async requestForgotPassword(@Body() dto: TenantRequestForgotPasswordDto) {
    return this.tenantAuthService.requestForgotPassword(dto);
  }

  /**
   * POST /tenant-auth/forgot-password/verify-otp
   * Public — tenant verifies OTP and sets new password.
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password/verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyForgotPassword(@Body() dto: TenantVerifyForgotPasswordDto) {
    return this.tenantAuthService.verifyForgotPassword(dto);
  }

  // ─── Deprecated: Magic-link auth ────────────────────────────

  /**
   * POST /tenant-auth/generate
   * @deprecated Owner generates a magic-link for a tenant.
   */
  @UseGuards(JwtAuthGuard)
  @Post('generate')
  async generateLink(@Body() dto: GenerateLinkDto, @Request() req: any) {
    const ownerId = req.user.ownerId || req.user.userId;
    return this.tenantAuthService.generateLink(dto.tenantId, ownerId);
  }

  /**
   * GET /tenant-auth/link/:tenantId
   * @deprecated Owner checks if an active magic-link exists.
   */
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  @Get('link/:tenantId')
  async getActiveLink(
    @Param('tenantId', ParseObjectIdPipe) tenantId: string,
    @Request() req: any,
  ) {
    const ownerId = req.user.ownerId || req.user.userId;
    const result = await this.tenantAuthService.getActiveLink(tenantId, ownerId);
    return result ?? { link: null, expiresAt: null };
  }

  /**
   * POST /tenant-auth/verify
   * @deprecated Public — tenant submits magic-link token.
   */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyToken(@Body() dto: VerifyTokenDto) {
    return this.tenantAuthService.verifyToken(dto.token);
  }

  // ─── Shared ──────────────────────────────────────────────────

  /**
   * POST /tenant-auth/refresh
   * Tenant refreshes their JWT.
   */
  @UseGuards(TenantJwtGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Request() req: any) {
    return this.tenantAuthService.refreshToken(req.user.tenantId, req.user.ownerId);
  }

  /**
   * GET /tenant-auth/profile
   * Returns the authenticated tenant's profile.
   */
  @UseGuards(TenantJwtGuard)
  @SkipThrottle()
  @Get('profile')
  async getProfile(@Request() req: any) {
    return this.tenantAuthService.getProfile(req.user.tenantId);
  }

  /**
   * POST /tenant-auth/revoke/:tenantId
   * Owner revokes all active tokens for a tenant.
   */
  @UseGuards(JwtAuthGuard)
  @Post('revoke/:tenantId')
  @HttpCode(HttpStatus.OK)
  async revokeTokens(@Param('tenantId', ParseObjectIdPipe) tenantId: string) {
    await this.tenantAuthService.revokeTokens(tenantId);
    return { message: 'Tokens revoked' };
  }
}
