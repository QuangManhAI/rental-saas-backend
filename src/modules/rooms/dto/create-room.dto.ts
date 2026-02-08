import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsEnum,
  IsMongoId,
  IsOptional,
  Min,
} from 'class-validator';
import { RoomStatus } from '../enums/room-status.enum';

export class CreateRoomDto {
  @IsNotEmpty({ message: 'Room name is required' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Price is required' })
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  area?: number;

  @IsNotEmpty({ message: 'Property ID is required' })
  @IsMongoId({ message: 'Invalid property ID' })
  propertyId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;
}
