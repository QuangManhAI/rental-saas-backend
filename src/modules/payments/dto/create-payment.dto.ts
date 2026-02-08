import {
  IsNotEmpty,
  IsMongoId,
  IsNumber,
  Min,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaymentMethod } from '../enums/payment-method.enum';

export class CreatePaymentDto {
  @IsNotEmpty({ message: 'Bill ID is required' })
  @IsMongoId()
  billId: string;

  @IsNotEmpty({ message: 'Amount is required' })
  @IsNumber()
  @Min(1, { message: 'Minimum payment is 1' })
  amount: number;

  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod;

  @IsOptional()
  @IsString()
  note?: string;
}
