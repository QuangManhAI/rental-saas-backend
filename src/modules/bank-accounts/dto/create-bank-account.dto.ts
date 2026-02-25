import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsString()
  @IsNotEmpty()
  accountName: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
