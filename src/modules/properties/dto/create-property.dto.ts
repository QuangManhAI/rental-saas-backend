import { IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePropertyDto {
  @IsNotEmpty({ message: 'Property name is required' })
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => value?.trim())
  name: string;

  @IsNotEmpty({ message: 'Address is required' })
  @IsString()
  @Transform(({ value }: { value: string }) => value?.trim())
  address: string;

  @IsOptional()
  @IsString()
  description?: string;
}
