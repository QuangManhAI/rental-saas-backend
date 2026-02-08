import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  IsDateString,
  Matches,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTenantDto {
  @IsNotEmpty({ message: 'Full name is required' })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  fullName: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email?: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(/^[0-9]{9,15}$/, {
    message: 'Phone must be 9-15 digits',
  })
  phone: string;

  @IsNotEmpty({ message: 'Identity card (CCCD/CMND) is required' })
  @IsString()
  @MinLength(9, { message: 'Identity card must be at least 9 characters' })
  identityCard: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid date format for dob' })
  dob?: string;
}
