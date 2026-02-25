import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { SubscriptionPlan } from '../subscription.schema';

export class ActivatePlanDto {
  @IsString()
  ownerId: string;

  @IsEnum(SubscriptionPlan)
  plan: SubscriptionPlan;

  @IsInt()
  @Min(1)
  months: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
