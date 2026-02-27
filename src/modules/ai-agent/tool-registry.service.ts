import { Injectable, Logger } from '@nestjs/common';
import { AgentTool, ToolResult } from './tools/agent-tool.interface';
import { RoomStatusTool } from './tools/room-status.tool';
import { BillSummaryTool } from './tools/bill-summary.tool';
import { ContractInfoTool } from './tools/contract-info.tool';
import { RevenueTool } from './tools/revenue.tool';
import { AddRoomTool } from './tools/add-room.tool';
import { AddTenantTool } from './tools/add-tenant.tool';
import { CreateContractTool } from './tools/create-contract.tool';
import { TenantInfoTool } from './tools/tenant-info.tool';
import { UserPayload } from '../../shared/types';

@Injectable()
export class ToolRegistryService {
    private readonly logger = new Logger(ToolRegistryService.name);
    private readonly tools = new Map<string, AgentTool>();

    constructor(
        roomStatusTool: RoomStatusTool,
        billSummaryTool: BillSummaryTool,
        contractInfoTool: ContractInfoTool,
        revenueTool: RevenueTool,
        addRoomTool: AddRoomTool,
        addTenantTool: AddTenantTool,
        createContractTool: CreateContractTool,
        tenantInfoTool: TenantInfoTool,
    ) {
        for (const tool of [roomStatusTool, billSummaryTool, contractInfoTool, revenueTool, addRoomTool, addTenantTool, createContractTool, tenantInfoTool]) {
            this.tools.set(tool.name, tool);
        }
        this.logger.log(`Registered ${this.tools.size} AI tools`);
    }

    /** Get all tool definitions for OpenAI */
    getToolDefinitions() {
        return Array.from(this.tools.values()).map((t) => t.definition);
    }

    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    /** Execute a tool by name. Returns standardized ToolResult. */
    async executeTool(
        name: string,
        args: Record<string, any>,
        user: UserPayload,
    ): Promise<ToolResult> {
        const tool = this.tools.get(name);
        if (!tool) {
            return { success: false, data: {}, error: `Unknown tool: ${name}` };
        }
        return tool.execute(args, user);
    }

    /** Deterministically format a response for a tool result. */
    formatResponse(name: string, result: ToolResult): string {
        const tool = this.tools.get(name);
        if (!tool) return 'Đã xử lý yêu cầu.';
        return tool.formatResponse(result);
    }
}
