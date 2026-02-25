import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Param,
} from '@nestjs/common';
import { Response } from 'express';
import { ReportService } from './report.service';
import { TelegramService } from '../telegram/telegram.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserPayload } from '../../shared/types';
import { MonthlyReportDto } from './dto/monthly-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, FeatureGuard)
export class ReportController {
  constructor(
    private readonly reportService: ReportService,
    private readonly telegramService: TelegramService,
  ) { }

  /**
   * GET /api/reports/monthly/excel?month=6&year=2024
   * Generates and downloads monthly Excel file directly.
   */
  @Get('monthly/excel')
  @RequireFeature('reports')
  async downloadMonthlyExcel(
    @Query() dto: MonthlyReportDto,
    @CurrentUser() user: UserPayload,
    @Res() response: Response,
  ) {
    const buffer = await this.reportService.generateMonthlyExcelBuffer(dto.month, dto.year, user);

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="report_${dto.year}_${String(dto.month).padStart(2, '0')}.xlsx"`,
    );
    response.send(buffer);
  }

  /**
   * GET /api/reports/revenue?year=2024
   * Generates a yearly revenue summary Excel.
   */
  @Get('revenue')
  @RequireFeature('reports')
  async revenueReport(
    @Query('year') year: number,
    @CurrentUser() user: UserPayload,
  ) {
    return this.reportService.generateRevenueReport(year, user);
  }

  /**
   * GET /api/reports/monthly/telegram?month=6&year=2024
   * Generate monthly Excel + send as document to Telegram.
   */
  @Get('monthly/telegram')
  @HttpCode(HttpStatus.OK)
  @RequireFeature('telegram')
  async sendMonthlyToTelegram(@Query() dto: MonthlyReportDto, @CurrentUser() user: UserPayload) {
    return this.reportService.sendMonthlyToTelegram(dto.month, dto.year, user);
  }

  /**
   * GET /api/reports/revenue/telegram?year=2024
   * Generate yearly revenue Excel + send summary to Telegram.
   */
  @Get('revenue/telegram')
  @HttpCode(HttpStatus.OK)
  @RequireFeature('telegram')
  async revenueToTelegram(
    @Query('year') year: number,
    @CurrentUser() user: UserPayload,
  ) {
    return this.reportService.sendRevenueToTelegram(year, user);
  }

  /**
   * POST /api/reports/monthly/:tenantId/telegram
   * Generate monthly Excel and send to tenant's Telegram.
   */
  @Post('monthly/:tenantId/telegram')
  @HttpCode(HttpStatus.OK)
  @RequireFeature('telegram')
  async sendMonthlyToTenant(
    @Param('tenantId') tenantId: string,
    @Query('month') month: number,
    @Query('year') year: number,
    @CurrentUser() user: UserPayload,
  ) {
    const buffer = await this.reportService.generateTenantMonthlyExcelBuffer(
      tenantId,
      month,
      year,
      user,
    );
    const result = await this.telegramService.sendDocumentToTenant(tenantId, buffer, `report_${year}_${String(month).padStart(2, '0')}.xlsx`, 'Monthly Report');
    return {
      message: `Monthly report sent to tenant ${tenantId}`,
      telegram: result,
    };
  }
}
