import { Injectable } from '@nestjs/common';
import { BillsService } from '../../bills/bills.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';

const STATUS_VI: Record<string, string> = {
    unpaid: 'Chưa TT',
    partial: 'Một phần',
    paid: 'Đã TT',
    overdue: 'Quá hạn',
};

function fmt(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

@Injectable()
export class BillSummaryTool implements AgentTool {
    readonly name = 'getBillSummary';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'getBillSummary',
            description:
                'Lấy danh sách hoá đơn của chủ trọ. Có thể lọc theo tháng, năm, và trạng thái thanh toán: unpaid (chưa thanh toán), partial (thanh toán một phần), paid (đã thanh toán).',
            parameters: {
                type: 'object',
                properties: {
                    month: { type: 'number', description: 'Tháng (1-12)' },
                    year: { type: 'number', description: 'Năm (ví dụ 2026)' },
                    status: {
                        type: 'string',
                        enum: ['unpaid', 'partial', 'paid'],
                        description: 'Trạng thái thanh toán',
                    },
                },
            },
        },
    };

    constructor(private readonly billsService: BillsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const result = await this.billsService.findAll(user, {
                month: args.month,
                year: args.year,
                status: args.status,
                limit: 50,
            });

            const bills = result.data;
            const totalAmount = bills.reduce((s: number, b: any) => s + (b.totalAmount || 0), 0);
            const totalPaid = bills.reduce((s: number, b: any) => s + (b.paidAmount || 0), 0);

            return {
                success: true,
                data: {
                    bills: bills.map((b: any) => ({
                        id: b._id,
                        room: b.roomId?.name || 'N/A',
                        month: b.month,
                        year: b.year,
                        totalAmount: b.totalAmount,
                        paidAmount: b.paidAmount,
                        status: b.status,
                    })),
                    summary: { count: bills.length, totalAmount, totalPaid, totalUnpaid: totalAmount - totalPaid },
                    filterMonth: args.month, filterYear: args.year, filterStatus: args.status,
                },
            };
        } catch (err: unknown) {
            return { success: false, data: {}, error: err instanceof Error ? err.message : 'Lỗi lấy hoá đơn' };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể lấy hoá đơn: ${result.error}`;

        const { bills, summary, filterMonth, filterYear } = result.data;
        if (summary.count === 0) {
            const period = filterMonth && filterYear ? ` tháng ${filterMonth}/${filterYear}` : '';
            return `Không có hoá đơn${period} nào.`;
        }

        const period = filterMonth && filterYear ? ` tháng ${filterMonth}/${filterYear}` : '';
        const lines = [
            `Có ${summary.count} hoá đơn${period}:`,
            `  Tổng: ${fmt(summary.totalAmount)} | Đã thu: ${fmt(summary.totalPaid)} | Còn thiếu: ${fmt(summary.totalUnpaid)}`,
        ];
        for (const b of bills.slice(0, 10)) {
            lines.push(`• ${b.room} – T${b.month}/${b.year} – ${fmt(b.totalAmount)} – ${STATUS_VI[b.status] || b.status}`);
        }
        if (bills.length > 10) lines.push(`  ...và ${bills.length - 10} hoá đơn khác`);
        return lines.join('\n');
    }
}
