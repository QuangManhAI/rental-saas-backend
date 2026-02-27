import { Injectable } from '@nestjs/common';
import { AnalyticsService } from '../../analytics/analytics.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';
import dayjs from 'dayjs';

function fmt(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

@Injectable()
export class RevenueTool implements AgentTool {
    readonly name = 'getRevenue';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'getRevenue',
            description:
                'Lấy thống kê doanh thu, số liệu phòng, và xu hướng thu nhập. Mặc định trả về dữ liệu tháng hiện tại. Có thể chỉ định khoảng thời gian.',
            parameters: {
                type: 'object',
                properties: {
                    from: {
                        type: 'string',
                        description: 'Ngày bắt đầu (ISO 8601, ví dụ "2026-02-01"). Mặc định: đầu tháng hiện tại.',
                    },
                    to: {
                        type: 'string',
                        description: 'Ngày kết thúc (ISO 8601, ví dụ "2026-02-28"). Mặc định: ngày hiện tại.',
                    },
                },
            },
        },
    };

    constructor(private readonly analyticsService: AnalyticsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const from = args.from || dayjs().startOf('month').format('YYYY-MM-DD');
            const to = args.to || dayjs().format('YYYY-MM-DD');

            const data = await this.analyticsService.getDashboardAnalytics(
                user.ownerId,
                { from, to, groupBy: 'month' as any },
            );

            return {
                success: true,
                data: { period: { from, to }, ...data },
            };
        } catch (err: unknown) {
            return { success: false, data: {}, error: err instanceof Error ? err.message : 'Lỗi lấy doanh thu' };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể lấy doanh thu: ${result.error}`;

        const d = result.data;
        const lines = [`Thống kê từ ${d.period.from} đến ${d.period.to}:`];

        if (d.totalRevenue !== undefined) lines.push(`• Doanh thu: ${fmt(d.totalRevenue)}`);
        if (d.totalCollected !== undefined) lines.push(`• Đã thu: ${fmt(d.totalCollected)}`);
        if (d.totalUnpaid !== undefined) lines.push(`• Chưa thu: ${fmt(d.totalUnpaid)}`);
        if (d.activeContracts !== undefined) lines.push(`• Hợp đồng đang hoạt động: ${d.activeContracts}`);
        if (d.occupiedRooms !== undefined && d.availableRooms !== undefined) {
            lines.push(`• Phòng: ${d.occupiedRooms} đang thuê, ${d.availableRooms} trống`);
        }

        return lines.length > 1 ? lines.join('\n') : 'Chưa có dữ liệu doanh thu.';
    }
}
