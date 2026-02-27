import { Injectable, Logger } from '@nestjs/common';
import { RoomsService } from '../../rooms/rooms.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';

function fmt(n: number): string {
    return n.toLocaleString('vi-VN') + 'đ';
}

@Injectable()
export class AddRoomTool implements AgentTool {
    private readonly logger = new Logger(AddRoomTool.name);
    readonly name = 'addRoom';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'addRoom',
            description:
                'Thêm phòng trọ mới vào nhà trọ. Cần tên phòng, giá thuê hàng tháng (VND), và ID nhà trọ. Có thể thêm diện tích và mô tả.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Tên phòng (VD: "Phòng 401")' },
                    price: { type: 'number', description: 'Giá thuê hàng tháng (VND, VD: 3000000)' },
                    propertyId: { type: 'string', description: 'ID nhà trọ để thêm phòng vào' },
                    area: { type: 'number', description: 'Diện tích phòng (m², tuỳ chọn)' },
                    description: { type: 'string', description: 'Mô tả phòng (tuỳ chọn)' },
                },
                required: ['name', 'price', 'propertyId'],
            },
        },
    };

    constructor(private readonly roomsService: RoomsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const room = await this.roomsService.create(
                { name: args.name, price: args.price, propertyId: args.propertyId, area: args.area, description: args.description },
                user,
            );
            this.logger.log(`Room created via AI: ${room.name} (${room._id})`);

            return {
                success: true,
                data: { id: room._id, name: room.name, price: room.price, area: room.area, status: room.status },
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Lỗi tạo phòng';
            this.logger.warn(`AI addRoom failed: ${msg}`);
            return { success: false, data: {}, error: msg };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể tạo phòng: ${result.error}`;
        const r = result.data;
        const area = r.area ? ` (${r.area}m²)` : '';
        return `Đã tạo ${r.name}${area} thành công, giá ${fmt(r.price)}/tháng.`;
    }
}
