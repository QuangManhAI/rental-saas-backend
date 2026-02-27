import { Injectable, Logger } from '@nestjs/common';
import { ContractsService } from '../../contracts/contracts.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';

function fmt(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

function fmtDate(d: any): string {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('vi-VN');
}

@Injectable()
export class CreateContractTool implements AgentTool {
    private readonly logger = new Logger(CreateContractTool.name);
    readonly name = 'createContract';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'createContract',
            description:
                'Tạo hợp đồng thuê phòng mới. Cần ID phòng (phải trống), ID khách thuê, ngày bắt đầu, ngày kết thúc, và giá thuê. Phòng sẽ tự động chuyển sang trạng thái OCCUPIED.',
            parameters: {
                type: 'object',
                properties: {
                    roomId: { type: 'string', description: 'ID phòng muốn cho thuê (phòng phải đang AVAILABLE)' },
                    tenantId: { type: 'string', description: 'ID khách thuê' },
                    startDate: { type: 'string', description: 'Ngày bắt đầu hợp đồng (ISO: YYYY-MM-DD)' },
                    endDate: { type: 'string', description: 'Ngày kết thúc hợp đồng (ISO: YYYY-MM-DD)' },
                    rentPrice: { type: 'number', description: 'Giá thuê hàng tháng (VND)' },
                    deposit: { type: 'number', description: 'Tiền đặt cọc (VND, tuỳ chọn, mặc định 0)' },
                },
                required: ['roomId', 'tenantId', 'startDate', 'endDate', 'rentPrice'],
            },
        },
    };

    constructor(private readonly contractsService: ContractsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const contract = await this.contractsService.create(
                { roomId: args.roomId, tenantId: args.tenantId, startDate: args.startDate, endDate: args.endDate, rentPrice: args.rentPrice, deposit: args.deposit },
                user,
            );
            this.logger.log(`Contract created via AI: ${contract._id}`);

            return {
                success: true,
                data: {
                    id: contract._id,
                    roomId: args.roomId,
                    tenantId: args.tenantId,
                    startDate: args.startDate,
                    endDate: args.endDate,
                    rentPrice: args.rentPrice,
                    deposit: args.deposit || 0,
                },
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Lỗi tạo hợp đồng';
            this.logger.warn(`AI createContract failed: ${msg}`);
            return { success: false, data: {}, error: msg };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể tạo hợp đồng: ${result.error}`;
        const d = result.data;
        return `Đã tạo hợp đồng thành công.\n• Giá thuê: ${fmt(d.rentPrice)}/tháng\n• Thời hạn: ${fmtDate(d.startDate)} → ${fmtDate(d.endDate)}\n• Phòng đã chuyển sang trạng thái Đang thuê.`;
    }
}
