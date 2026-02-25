import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantJwtGuard } from '../../common/guards/tenant-jwt.guard';
import { InvoiceService } from './invoice.service';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';

@Controller('bills')
@SkipThrottle()
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /**
   * GET /bills/:id/invoice
   * Owner downloads PDF invoice for a bill.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id/invoice')
  async getInvoiceOwner(
    @Param('id', ParseObjectIdPipe) id: string,
    @Request() req: any,
  ): Promise<StreamableFile> {
    return this.invoiceService.generateInvoicePdf(id, req.user);
  }

  /**
   * GET /bills/:id/invoice/tenant
   * Tenant downloads their own bill invoice.
   * Uses tenantPayload — constructs a fake UserPayload with ownerId.
   */
  @UseGuards(TenantJwtGuard)
  @Get(':id/invoice/tenant')
  async getInvoiceTenant(
    @Param('id', ParseObjectIdPipe) id: string,
    @Request() req: any,
  ): Promise<StreamableFile> {
    // Construct UserPayload from tenant JWT payload
    const fakeUserPayload = {
      userId: req.user.tenantId,
      email: '',
      role: 'tenant',
      ownerId: req.user.ownerId,
    };
    return this.invoiceService.generateInvoicePdf(id, fakeUserPayload as any);
  }
}
