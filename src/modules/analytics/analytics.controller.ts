import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { GetDashboardAnalyticsDto } from './dto/get-dashboard-analytics.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) { }

    @Get('dashboard')
    async getDashboardAnalytics(@Query() query: GetDashboardAnalyticsDto, @Request() req: any) {
        const ownerId = req.user.ownerId;
        return this.analyticsService.getDashboardAnalytics(ownerId, query);
    }
}
