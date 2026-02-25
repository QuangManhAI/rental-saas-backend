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
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { SubscriptionService } from '../subscription/subscription.service';

@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreatePropertyDto,
    @CurrentUser() user: UserPayload,
  ) {
    await this.subscriptionService.checkPropertyLimit(user.ownerId);
    return this.propertiesService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: UserPayload,
    @Query() query: PaginationDto,
  ) {
    return this.propertiesService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.propertiesService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdatePropertyDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.propertiesService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.propertiesService.remove(id, user);
  }
}
