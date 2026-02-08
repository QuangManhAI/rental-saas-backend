import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  create(
    @Body() dto: CreatePropertyDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.propertiesService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: UserPayload) {
    return this.propertiesService.findAll(user);
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
