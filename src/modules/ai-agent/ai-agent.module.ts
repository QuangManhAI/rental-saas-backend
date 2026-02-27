import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

// Schemas
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { AiUsage, AiUsageSchema } from './schemas/ai-usage.schema';
import { ToolExecution, ToolExecutionSchema } from './schemas/tool-execution.schema';

// Services
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './ai-agent.service';
import { LlmProviderService } from './llm-provider.service';
import { ToolRegistryService } from './tool-registry.service';
import { UsageTrackingService } from './usage-tracking.service';

// Guard
import { AiAccessGuard } from './guards/ai-access.guard';

// Tools
import { RoomStatusTool } from './tools/room-status.tool';
import { BillSummaryTool } from './tools/bill-summary.tool';
import { ContractInfoTool } from './tools/contract-info.tool';
import { RevenueTool } from './tools/revenue.tool';
import { AddRoomTool } from './tools/add-room.tool';
import { AddTenantTool } from './tools/add-tenant.tool';
import { CreateContractTool } from './tools/create-contract.tool';
import { TenantInfoTool } from './tools/tenant-info.tool';

// Dependencies from other modules
import { SubscriptionModule } from '../subscription/subscription.module';
import { RoomsModule } from '../rooms/rooms.module';
import { BillsModule } from '../bills/bills.module';
import { ContractsModule } from '../contracts/contracts.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Conversation.name, schema: ConversationSchema },
            { name: Message.name, schema: MessageSchema },
            { name: AiUsage.name, schema: AiUsageSchema },
            { name: ToolExecution.name, schema: ToolExecutionSchema },
        ]),
        // Import other modules to use their services
        SubscriptionModule,
        RoomsModule,
        BillsModule,
        ContractsModule,
        AnalyticsModule,
        TenantsModule,
    ],
    controllers: [AiAgentController],
    providers: [
        AiAgentService,
        LlmProviderService,
        ToolRegistryService,
        UsageTrackingService,
        AiAccessGuard,
        // Tools
        RoomStatusTool,
        BillSummaryTool,
        ContractInfoTool,
        RevenueTool,
        AddRoomTool,
        AddTenantTool,
        CreateContractTool,
        TenantInfoTool,
    ],
})
export class AiAgentModule { }
