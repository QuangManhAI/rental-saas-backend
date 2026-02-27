import { Injectable, Logger } from '@nestjs/common';
import { TenantsService } from '../../tenants/tenants.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';

@Injectable()
export class AddTenantTool implements AgentTool {
    private readonly logger = new Logger(AddTenantTool.name);
    readonly name = 'addTenant';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'addTenant',
            description:
                'Thêm khách thuê mới. Cần họ tên, số điện thoại, và số CCCD/CMND. Có thể thêm email, địa chỉ, ngày sinh.',
            parameters: {
                type: 'object',
                properties: {
                    fullName: { type: 'string', description: 'Họ tên đầy đủ (VD: "Nguyễn Văn A")' },
                    phone: { type: 'string', description: 'Số điện thoại (9-15 chữ số, VD: "0901234567")' },
                    identityCard: { type: 'string', description: 'Số CCCD/CMND (VD: "079200001234")' },
                    email: { type: 'string', description: 'Email (tuỳ chọn)' },
                    address: { type: 'string', description: 'Địa chỉ quê quán (tuỳ chọn)' },
                    dob: { type: 'string', description: 'Ngày sinh ISO (YYYY-MM-DD, tuỳ chọn)' },
                },
                required: ['fullName', 'phone', 'identityCard'],
            },
        },
    };

    constructor(private readonly tenantsService: TenantsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const tenant = await this.tenantsService.create(
                { fullName: args.fullName, phone: args.phone, identityCard: args.identityCard, email: args.email, address: args.address, dob: args.dob },
                user,
            );
            this.logger.log(`Tenant created via AI: ${tenant.fullName} (${tenant._id})`);

            return {
                success: true,
                data: { id: tenant._id, fullName: tenant.fullName, phone: tenant.phone, identityCard: tenant.identityCard },
            };
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Lỗi thêm khách thuê';
            this.logger.warn(`AI addTenant failed: ${msg}`);
            return { success: false, data: {}, error: msg };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể thêm khách thuê: ${result.error}`;
        return `Đã thêm khách thuê ${result.data.fullName} (SĐT: ${result.data.phone}) thành công.`;
    }
}
