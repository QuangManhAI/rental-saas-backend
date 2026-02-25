import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionPlan } from '../subscription.schema';
import { PaymentMethod } from '../upgrade-request.schema';

export class RequestUpgradeDto {
  @IsIn([SubscriptionPlan.BASIC, SubscriptionPlan.PRO])
  toPlan: SubscriptionPlan;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  months: number;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}
