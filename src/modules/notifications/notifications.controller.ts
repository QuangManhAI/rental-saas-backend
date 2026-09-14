import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { SkipThrottle } from '@nestjs/throttler';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationType } from './notifications.schema';

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@SkipThrottle()
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: UserPayload,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByOwner(user, limit ? parseInt(limit, 10) : 50);
  }

  @Post()
  @Roles(Role.OWNER)
  create(
    @CurrentUser() user: UserPayload,
    @Body() dto: CreateNotificationDto,
  ) {
    return this.service.create({
      ...dto,
      ownerId: user.ownerId,
      type: dto.type || NotificationType.INFO,
    });
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.markRead(id, user);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() user: UserPayload) {
    return this.service.markAllRead(user);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  delete(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.service.delete(id, user);
  }
}

