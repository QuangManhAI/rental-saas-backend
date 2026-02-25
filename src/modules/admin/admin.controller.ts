import {
  Controller, Get, Patch, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@SkipThrottle()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('health')
  getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @Get('users')
  listUsers(@Query() query: PaginationDto & { search?: string; role?: string }) {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string) {
    return this.adminService.getUser(id);
  }

  @Patch('users/:id/toggle-active')
  @HttpCode(HttpStatus.OK)
  toggleUserActive(@Param('id') id: string) {
    return this.adminService.toggleUserActive(id);
  }
}
