import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Query,
} from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyRegisterOtpDto } from './dto/verify-register-otp.dto';
import { VerifyChangePasswordOtpDto } from './dto/verify-change-password-otp.dto';
import { RequestForgotPasswordOtpDto, VerifyForgotPasswordOtpDto } from './dto/verify-forgot-password-otp.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // 3 registration attempts per minute per IP — prevents account spam
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // 5 login attempts per minute per IP — brute force protection
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Token refresh: 20/min is generous for legitimate use
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @SkipThrottle()
  logout(@CurrentUser() user: UserPayload) {
    return this.authService.logout(user.userId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @SkipThrottle()
  getProfile(@CurrentUser() user: UserPayload) {
    return user;
  }

  // 10 verify attempts per minute per IP
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // 3 resend attempts per minute per IP
  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendVerification(@CurrentUser() user: UserPayload) {
    return this.authService.resendVerification(user.userId);
  }

  // ─── OTP-based Registration ─────────────────────────────────────────────

  @Post('register/request-otp')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestRegisterOtp(@Body() dto: RegisterDto) {
    return this.authService.requestRegisterOtp(dto);
  }

  @Post('register/verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verifyRegisterOtp(@Body() dto: VerifyRegisterOtpDto) {
    return this.authService.verifyRegisterOtp(dto);
  }

  // ─── OTP-based Change Password ──────────────────────────────────────────

  @Post('change-password/request-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestChangePasswordOtp(@CurrentUser() user: UserPayload) {
    return this.authService.requestChangePasswordOtp(user.userId);
  }

  @Post('change-password/verify-otp')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verifyChangePasswordOtp(
    @CurrentUser() user: UserPayload,
    @Body() dto: VerifyChangePasswordOtpDto,
  ) {
    return this.authService.verifyChangePasswordOtp(user.userId, dto);
  }

  // ─── OTP-based Forgot Password ────────────────────────────────────────

  @Post('forgot-password/request-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  requestForgotPasswordOtp(@Body() dto: RequestForgotPasswordOtpDto) {
    return this.authService.requestForgotPasswordOtp(dto);
  }

  @Post('forgot-password/verify-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verifyForgotPasswordOtp(@Body() dto: VerifyForgotPasswordOtpDto) {
    return this.authService.verifyForgotPasswordOtp(dto);
  }
}
