import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { NotificationType } from '../notifications.schema';

export class CreateNotificationDto {
  @IsNotEmpty({ message: 'Tiêu đề thông báo không được để trống' })
  @IsString()
  @MaxLength(150, { message: 'Tiêu đề không được vượt quá 150 ký tự' })
  title: string;

  @IsNotEmpty({ message: 'Nội dung thông báo không được để trống' })
  @IsString()
  @MaxLength(2000, { message: 'Nội dung không được vượt quá 2000 ký tự' })
  message: string;

  @IsOptional()
  @IsEnum(NotificationType, { message: 'Loại thông báo không hợp lệ' })
  type?: NotificationType;

  @IsOptional()
  @IsString()
  link?: string;
}
