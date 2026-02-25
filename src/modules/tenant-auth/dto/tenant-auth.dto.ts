import { IsEmail, IsNotEmpty, IsString, MinLength, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class ActivateAccountDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @MinLength(6, { message: 'Mật khẩu ít nhất 6 ký tự' })
  password: string;
}

export class TenantLoginDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

export class TenantRequestForgotPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}

export class TenantVerifyForgotPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'Mã OTP phải có 6 chữ số' })
  code: string;

  @IsNotEmpty()
  @MinLength(6, { message: 'Mật khẩu ít nhất 6 ký tự' })
  newPassword: string;
}
