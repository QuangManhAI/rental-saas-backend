import { Injectable } from '@nestjs/common';
import { TenantsService } from '../../tenants/tenants.service';
import { AgentTool, ToolResult } from './agent-tool.interface';
import { UserPayload } from '../../../shared/types';

function fmtDate(d: any): string {
    if (!d) return 'N/A';
    return new Date(d).toLocaleDateString('vi-VN');
}

@Injectable()
export class TenantInfoTool implements AgentTool {
    readonly name = 'getTenantInfo';

    readonly definition = {
        type: 'function' as const,
        function: {
            name: 'getTenantInfo',
            description:
                'Tra cứu khách thuê theo tên, số điện thoại hoặc CCCD. Trả về danh sách khách thuê khớp với từ khoá tìm kiếm, bao gồm tenantId để dùng cho createContract.',
            parameters: {
                type: 'object',
                properties: {
                    search: {
                        type: 'string',
                        description: 'Tên, số điện thoại, hoặc số CCCD của khách thuê cần tìm',
                    },
                },
                required: ['search'],
            },
        },
    };

    constructor(private readonly tenantsService: TenantsService) {}

    async execute(args: Record<string, any>, user: UserPayload): Promise<ToolResult> {
        try {
            const result = await this.tenantsService.findAll(user, {
                search: args.search,
                limit: 10,
            });

            return {
                success: true,
                data: {
                    tenants: result.data.map((t: any) => ({
                        id: t._id,
                        fullName: t.fullName,
                        phone: t.phone,
                        identityCard: t.identityCard,
                        email: t.email || null,
                    })),
                    total: result.data.length,
                    searchQuery: args.search,
                },
            };
        } catch (err: unknown) {
            return { success: false, data: {}, error: err instanceof Error ? err.message : 'Lỗi tìm khách thuê' };
        }
    }

    formatResponse(result: ToolResult): string {
        if (!result.success) return `Không thể tìm khách thuê: ${result.error}`;

        const { tenants, total, searchQuery } = result.data;
        if (total === 0) {
            return `Không tìm thấy khách thuê nào với từ khoá "${searchQuery}".`;
        }

        const lines = [`Tìm thấy ${total} khách thuê:`];
        for (const t of tenants) {
            const email = t.email ? ` – ${t.email}` : '';
            lines.push(`• ${t.fullName} – SĐT: ${t.phone} – CCCD: ${t.identityCard}${email}`);
        }
        return lines.join('\n');
    }
}
