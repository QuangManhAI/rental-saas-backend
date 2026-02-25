import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { BillsService } from './bills.service';
import { CreateBillDto } from './dto/create-bill.dto';
import { BillStatus } from './enums/bill-status.enum';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AuditInterceptor } from '../../common/interceptors/audit.interceptor';
import { PaginationDto } from '../../common/dto/pagination.dto';

@Controller('bills')
@UseGuards(JwtAuthGuard)
@UseInterceptors(AuditInterceptor)
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Post()
  create(@Body() dto: CreateBillDto, @CurrentUser() user: UserPayload) {
    return this.billsService.create(dto, user);
  }

  @Get()
  findAll(
    @CurrentUser() user: UserPayload,
    @Query() query: PaginationDto & { status?: BillStatus; month?: number; year?: number },
  ) {
    return this.billsService.findAll(user, query);
  }

  // Must be declared before :id to avoid route conflict
  @Get('deleted')
  findDeleted(@CurrentUser() user: UserPayload) {
    return this.billsService.findDeleted(user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.billsService.findOne(id, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.billsService.remove(id, user);
  }

  @Patch(':id/restore')
  restore(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: UserPayload,
  ) {
    return this.billsService.restore(id, user);
  }
}
