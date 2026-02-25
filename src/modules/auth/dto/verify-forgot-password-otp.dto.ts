import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RequestForgotPasswordOtpDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;
}

export class VerifyForgotPasswordOtpDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  code: string;

  @IsNotEmpty()
  @MinLength(6, { message: 'New password must be at least 6 characters' })
  newPassword: string;
}
