import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
@SkipThrottle()
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: UserPayload,
    @Query('limit') limit?: string,
  ) {
    return this.service.findByOwner(user, limit ? parseInt(limit, 10) : 20);
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
}
