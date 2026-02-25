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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { SubscriptionService } from '../subscription/subscription.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Post()
  @Roles(Role.OWNER)
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: UserPayload,
  ) {
    await this.subscriptionService.checkStaffLimit(user.ownerId);
    return this.usersService.create(createUserDto, user);
  }

  @Get()
  @Roles(Role.OWNER)
  findAll(@CurrentUser() user: UserPayload) {
    return this.usersService.findAll(user);
  }

  @Get('profile')
  getProfile(@CurrentUser() user: UserPayload) {
    return this.usersService.getProfile(user.userId);
  }

  @Get(':id')
  @Roles(Role.OWNER)
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.usersService.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.OWNER)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: UserPayload,
  ) {
    return this.usersService.update(id, updateUserDto, user);
  }

  @Delete(':id')
  @Roles(Role.OWNER)
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.usersService.remove(id, user);
  }
}
