import {
  IsNotEmpty,
  IsMongoId,
  IsNumber,
  Min,
  Max,
  IsOptional,
} from 'class-validator';

export class CreateBillDto {
  @IsNotEmpty({ message: 'Contract ID is required' })
  @IsMongoId()
  contractId: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(2020)
  year: number;

  // Electricity
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  electricOldIndex: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  electricNewIndex: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  electricRate: number;

  // Water
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  waterOldIndex: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  waterNewIndex: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  waterRate: number;

  // Other
  @IsOptional()
  @IsNumber()
  @Min(0)
  otherFee?: number;
}
