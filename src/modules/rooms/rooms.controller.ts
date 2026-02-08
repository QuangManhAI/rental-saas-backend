import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  create(@Body() dto: CreateRoomDto, @CurrentUser() user: UserPayload) {
    return this.roomsService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: UserPayload,
    @Query('propertyId') propertyId?: string,
  ) {
    return this.roomsService.findAll(user, propertyId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.roomsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateRoomDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.roomsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.roomsService.remove(id, user);
  }
}
