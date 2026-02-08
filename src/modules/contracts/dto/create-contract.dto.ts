import {
  IsNotEmpty,
  IsMongoId,
  IsDateString,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';

export class CreateContractDto {
  @IsNotEmpty({ message: 'Room ID is required' })
  @IsMongoId()
  roomId: string;

  @IsNotEmpty({ message: 'Tenant ID is required' })
  @IsMongoId()
  tenantId: string;

  @IsNotEmpty({ message: 'Start date is required' })
  @IsDateString()
  startDate: string;

  @IsNotEmpty({ message: 'End date is required' })
  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;

  @IsNotEmpty({ message: 'Rent price is required' })
  @IsNumber()
  @Min(0)
  rentPrice: number;
}
