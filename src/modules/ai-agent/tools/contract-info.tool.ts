import { Injectable } from '@nestjs/common';
import { ContractsService } from '../../contracts/contracts.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';

const STATUS_VI: Record<string, string> = {
    active: 'Đang thuê',
    terminated: 'Đã kết thúc',
    expired: 'Hết hạn',
};

function fmt(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

function fmtDate(d: any): string {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('vi-VN');
}

@Injectable()
export class ContractInfoTool implements AgentTool {
    readonly name = 'getContractInfo';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'getContractInfo',
            description:
                'Lấy danh sách hợp đồng thuê phòng. Hiển thị thông tin khách thuê, phòng, giá thuê, ngày bắt đầu, ngày kết thúc, và trạng thái.',
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: ['active', 'terminated', 'expired'],
                        description: 'Trạng thái hợp đồng (tuỳ chọn)',
                    },
                },
            },
        },
    };

    constructor(private readonly contractsService: ContractsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const contracts = await this.contractsService.findAll(user);
            let filtered = contracts;
            if (args.status) {
                filtered = contracts.filter((c: any) => c.status === args.status);
            }

            return {
                success: true,
                data: {
                    contracts: filtered.map((c: any) => ({
                        id: c._id,
                        tenant: c.tenantId?.fullName || 'N/A',
                        tenantId: c.tenantId?._id || c.tenantId,
                        room: c.roomId?.name || 'N/A',
                        roomId: c.roomId?._id || c.roomId,
                        rentPrice: c.rentPrice,
                        startDate: c.startDate,
                        endDate: c.endDate,
                        status: c.status,
                    })),
                    total: filtered.length,
                    filterStatus: args.status || null,
                },
            };
        } catch (err: unknown) {
            return { success: false, data: {}, error: err instanceof Error ? err.message : 'Lỗi lấy hợp đồng' };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể lấy hợp đồng: ${result.error}`;

        const { contracts, total, filterStatus } = result.data;
        if (total === 0) {
            const label = filterStatus ? ` ${STATUS_VI[filterStatus] || filterStatus}` : '';
            return `Không có hợp đồng${label} nào.`;
        }

        const label = filterStatus ? ` ${STATUS_VI[filterStatus] || filterStatus}` : '';
        const lines = [`Có ${total} hợp đồng${label}:`];
        for (const c of contracts.slice(0, 10)) {
            lines.push(`• ${c.tenant} – ${c.room} – ${fmt(c.rentPrice)}/tháng – ${fmtDate(c.startDate)} → ${fmtDate(c.endDate)} – ${STATUS_VI[c.status] || c.status}`);
        }
        if (contracts.length > 10) lines.push(`  ...và ${contracts.length - 10} hợp đồng khác`);
        return lines.join('\n');
    }
}
