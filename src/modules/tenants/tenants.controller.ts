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
import { JwtService } from '@nestjs/jwt';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('tenants')
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  create(@Body() dto: CreateTenantDto, @CurrentUser() user: UserPayload) {
    return this.tenantsService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: UserPayload,
    @Query() query: PaginationDto,
  ) {
    return this.tenantsService.findAll(user, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.tenantsService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.tenantsService.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.tenantsService.remove(id, user);
  }

  @Post(':id/resend-activation')
  resendActivation(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.tenantsService.resendActivation(id, user);
  }

  @Get(':id/telegram-link')
  getTelegramLink(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    const token = this.jwtService.sign({ tenantId: id, ownerId: user.ownerId });
    return {
      url: `https://t.me/quangManhAI_bot?start=${token}`,
    };
  }
}
