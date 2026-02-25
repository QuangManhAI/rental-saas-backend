import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantJwtGuard } from '../../common/guards/tenant-jwt.guard';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('bank-accounts')
@SkipThrottle()
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  /** GET /bank-accounts/banks — list supported bank codes */
  @UseGuards(JwtAuthGuard)
  @Get('banks')
  getSupportedBanks() {
    return this.service.getSupportedBanks();
  }

  /** GET /bank-accounts */
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Request() req: any) {
    return this.service.findAll(req.user);
  }

  /** POST /bank-accounts */
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateBankAccountDto, @Request() req: any) {
    return this.service.create(dto, req.user);
  }

  /** PATCH /bank-accounts/:id/default */
  @UseGuards(JwtAuthGuard)
  @Patch(':id/default')
  setDefault(@Param('id', ParseObjectIdPipe) id: string, @Request() req: any) {
    return this.service.setDefault(id, req.user);
  }

  /** DELETE /bank-accounts/:id */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseObjectIdPipe) id: string, @Request() req: any) {
    return this.service.remove(id, req.user);
  }
}

/**
 * Separate controller for bills/:id/qr — placed here to avoid circular deps.
 * Accessible by both owner (JwtAuthGuard) and tenant (TenantJwtGuard).
 */
@Controller('bills')
@SkipThrottle()
export class BillQrController {
  constructor(private readonly service: BankAccountsService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':billId/qr')
  async getQrOwner(
    @Param('billId', ParseObjectIdPipe) billId: string,
    @Request() req: any,
  ) {
    const ownerId = req.user.ownerId || req.user.userId;
    return this.service.generateBillQr(billId, ownerId);
  }

  @UseGuards(TenantJwtGuard)
  @Get(':billId/qr/tenant')
  async getQrTenant(
    @Param('billId', ParseObjectIdPipe) billId: string,
    @Request() req: any,
  ) {
    return this.service.generateBillQr(billId, req.user.ownerId);
  }
}
