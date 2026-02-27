import { Injectable } from '@nestjs/common';
import { RoomsService } from '../../rooms/rooms.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';

const STATUS_VI: Record<string, string> = {
    AVAILABLE: 'Trống',
    OCCUPIED: 'Đang thuê',
    MAINTENANCE: 'Đang sửa',
};

function fmt(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

@Injectable()
export class RoomStatusTool implements AgentTool {
    readonly name = 'getRoomStatus';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'getRoomStatus',
            description:
                'Lấy danh sách phòng trọ của chủ trọ. Có thể lọc theo trạng thái: AVAILABLE (trống), OCCUPIED (đang thuê), MAINTENANCE (đang sửa chữa). Trả về tên phòng, giá, trạng thái, và nhà trọ.',
            parameters: {
                type: 'object',
                properties: {
                    status: {
                        type: 'string',
                        enum: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'],
                        description: 'Trạng thái phòng muốn lọc (tuỳ chọn)',
                    },
                    propertyId: {
                        type: 'string',
                        description: 'ID nhà trọ cụ thể để lọc (tuỳ chọn)',
                    },
                },
            },
        },
    };

    constructor(private readonly roomsService: RoomsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const result = await this.roomsService.findAll(user, {
                propertyId: args.propertyId,
                limit: 50,
            });

            let rooms = result.data;
            if (args.status) {
                rooms = rooms.filter((r: any) => r.status === args.status);
            }

            return {
                success: true,
                data: {
                    rooms: rooms.map((r: any) => ({
                        id: r._id,
                        name: r.name,
                        price: r.price,
                        status: r.status,
                        area: r.area,
                        property: r.propertyId?.name || 'N/A',
                        propertyId: r.propertyId?._id || r.propertyId,
                    })),
                    total: rooms.length,
                    filterStatus: args.status || null,
                },
            };
        } catch (err: unknown) {
            return { success: false, data: {}, error: err instanceof Error ? err.message : 'Lỗi lấy danh sách phòng' };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể lấy danh sách phòng: ${result.error}`;

        const { rooms, total, filterStatus } = result.data;
        if (total === 0) {
            const label = filterStatus ? ` ${STATUS_VI[filterStatus] || filterStatus}` : '';
            return `Không tìm thấy phòng${label} nào.`;
        }

        const label = filterStatus ? ` ${STATUS_VI[filterStatus] || filterStatus}` : '';
        const lines = [`Có ${total} phòng${label}:`];
        for (const r of rooms) {
            const area = r.area ? ` – ${r.area}m²` : '';
            lines.push(`• ${r.name}${area} – ${fmt(r.price)}/tháng – ${STATUS_VI[r.status] || r.status} (${r.property})`);
        }
        return lines.join('\n');
    }
}
