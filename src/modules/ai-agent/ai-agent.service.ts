import {
    Injectable,
    Logger,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schemas/conversation.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import { ToolExecution, ToolExecutionDocument } from './schemas/tool-execution.schema';
import { LlmProviderService } from './llm-provider.service';
import type { StreamChunk } from './llm-provider.service';
import { ToolRegistryService } from './tool-registry.service';
import { UsageTrackingService } from './usage-tracking.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { UserPayload } from '../../shared/types';
import type { ToolResult } from './tools/agent-tool.interface';
import type OpenAI from 'openai';
import { Subject, Observable } from 'rxjs';

/**
 * SSE event types sent to frontend:
 * - status: progress text ("Đang suy nghĩ...", "Đang tra cứu getRoomStatus...")
 * - token:  single text chunk for typewriter effect
 * - done:   final reply + usage stats
 * - error:  error message
 */
export interface StreamEvent {
    event: 'status' | 'token' | 'done' | 'error';
    data: Record<string, any>;
}

/**
 * Level-1 Controlled Agent system prompt.
 *
 * The LLM's job is ONLY to:
 *   1. Understand user intent
 *   2. Select the right tool(s)
 *   3. Extract parameters from natural language
 *
 * The backend generates final user-facing responses deterministically.
 * When the LLM can answer WITHOUT tools (greeting, clarification, chitchat),
 * it responds directly in Vietnamese.
 */
const SYSTEM_PROMPT = `Bạn là trợ lý AI cho chủ trọ trong hệ thống quản lý nhà trọ Rental SaaS.
Nhiệm vụ: hiểu ý định user → chọn tool phù hợp → trích xuất tham số từ câu nói tự nhiên.

## Các tool bạn có:
READ (tra cứu):
- getRoomStatus: xem danh sách phòng, trạng thái, giá. Trả về propertyId, roomId.
- getTenantInfo(search): tìm khách thuê theo tên/SĐT/CCCD. Trả về tenantId.
- getContractInfo: xem hợp đồng hiện tại. Trả về tenantId, roomId.
- getBillSummary: xem hoá đơn, công nợ.
- getRevenue: xem doanh thu, thống kê tài chính.

WRITE (thao tác):
- addRoom: thêm phòng mới (cần propertyId, name, price).
- addTenant: thêm khách thuê mới (cần fullName, phone, identityCard).
- createContract: tạo hợp đồng (cần roomId, tenantId, startDate, endDate, rentPrice).

## Quy trình xử lý:
1. Khi user yêu cầu TẠO HỢP ĐỒNG (ví dụ "thêm hợp đồng phòng X cho khách Y"):
   → Bước 1: Gọi getRoomStatus để tìm roomId từ tên phòng
   → Bước 2: Gọi getTenantInfo(search: "tên khách") để tìm tenantId
   → Bước 3: Gọi createContract với roomId, tenantId, startDate, endDate, rentPrice
   Nếu user không nói giá thuê, lấy giá phòng từ kết quả getRoomStatus làm rentPrice.

2. Khi user yêu cầu THÊM PHÒNG:
   → Gọi getRoomStatus để lấy propertyId → Gọi addRoom

3. Khi user hỏi về phòng/trạng thái: → Gọi getRoomStatus
4. Khi user hỏi về khách thuê: → Gọi getTenantInfo
5. Khi user hỏi về hợp đồng: → Gọi getContractInfo
6. Khi user hỏi về hoá đơn: → Gọi getBillSummary
7. Khi user hỏi về doanh thu: → Gọi getRevenue

## Quy tắc quan trọng:
- LUÔN gọi tool khi cần dữ liệu — KHÔNG BAO GIỜ tự bịa.
- KHÔNG hỏi user về ID. Tự tra cứu: getRoomStatus cho roomId, getTenantInfo cho tenantId.
- Nếu thiếu thông tin bắt buộc mà không tra cứu được, hỏi lại user bằng tiếng Việt.
- Khi trả lời trực tiếp (chào hỏi, giải thích), viết tiếng Việt ngắn gọn.
- CHỈ truy cập dữ liệu của chủ trọ đang đăng nhập.`;

const MAX_CONTEXT_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 5;

export interface SendMessageResult {
    reply: string;
    usage: {
        promptTokens: number;
        completionTokens: number;
        responseTimeMs: number;
        toolsUsed: string[];
        quota: { used: number; limit: number };
    };
}

@Injectable()
export class AiAgentService {
    private readonly logger = new Logger(AiAgentService.name);

    constructor(
        @InjectModel(Conversation.name)
        private readonly conversationModel: Model<ConversationDocument>,
        @InjectModel(Message.name)
        private readonly messageModel: Model<MessageDocument>,
        @InjectModel(ToolExecution.name)
        private readonly toolExecModel: Model<ToolExecutionDocument>,
        private readonly llmProvider: LlmProviderService,
        private readonly toolRegistry: ToolRegistryService,
        private readonly usageTracking: UsageTrackingService,
        private readonly subscriptionService: SubscriptionService,
    ) { }

    // ─── Conversations ──────────────────────────────────────────

    async createConversation(user: UserPayload, title?: string): Promise<ConversationDocument> {
        return this.conversationModel.create({
            ownerId: new Types.ObjectId(user.ownerId),
            title: title || 'Cuộc trò chuyện mới',
            status: 'active',
        });
    }

    async listConversations(user: UserPayload): Promise<ConversationDocument[]> {
        return this.conversationModel
            .find({ ownerId: new Types.ObjectId(user.ownerId), status: 'active' })
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean();
    }

    async deleteConversation(id: string, user: UserPayload): Promise<{ message: string }> {
        const result = await this.conversationModel.updateOne(
            { _id: id, ownerId: new Types.ObjectId(user.ownerId) },
            { status: 'archived' },
        );
        if (result.matchedCount === 0) throw new BadRequestException('Conversation not found');
        return { message: 'Conversation archived' };
    }

    async getMessages(conversationId: string, user: UserPayload): Promise<MessageDocument[]> {
        const conv = await this.conversationModel
            .findOne({ _id: conversationId, ownerId: new Types.ObjectId(user.ownerId) })
            .lean();
        if (!conv) throw new BadRequestException('Conversation not found');

        return this.messageModel
            .find({ conversationId: new Types.ObjectId(conversationId) })
            .sort({ createdAt: 1 })
            .lean();
    }

    // ─── Chat (Level-1 Controlled Agent Loop) ─────────────────

    async sendMessage(
        conversationId: string,
        userMessage: string,
        user: UserPayload,
    ): Promise<SendMessageResult> {
        const startTime = Date.now();
        const convOid = new Types.ObjectId(conversationId);

        // 1. Verify ownership
        const conv = await this.conversationModel
            .findOne({ _id: convOid, ownerId: new Types.ObjectId(user.ownerId), status: 'active' })
            .lean();
        if (!conv) throw new BadRequestException('Conversation not found');

        // 2. Check quota
        const subscription = await this.subscriptionService.getMySubscription(user.ownerId);
        const quota = await this.usageTracking.hasExceededQuota(user.ownerId, subscription.plan);
        if (quota.exceeded) {
            const info = quota.windowHours
                ? `${quota.limit} câu hỏi AI trong ${quota.windowHours} giờ qua`
                : `${quota.limit} câu hỏi AI trong tháng này`;
            throw new ForbiddenException(`Bạn đã sử dụng hết ${info}. Nâng cấp gói để có thêm lượt.`);
        }

        // 3. Save user message
        await this.messageModel.create({ conversationId: convOid, role: 'user', content: userMessage });

        // 4. Build LLM context
        const recentMessages = await this.messageModel
            .find({ conversationId: convOid })
            .sort({ createdAt: -1 })
            .limit(MAX_CONTEXT_MESSAGES)
            .lean();

        const llmMessages: OpenAI.ChatCompletionMessageParam[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...recentMessages
                .reverse()
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content || '' })),
        ];

        // 5. Agent loop
        const toolDefs = this.toolRegistry.getToolDefinitions();
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        const toolsUsed: string[] = [];
        let lastToolResult: ToolResult | null = null;
        let lastToolName: string | null = null;
        let reply = '';

        try {
            // Initial LLM call
            let llmResponse = await this.llmProvider.chat(llmMessages, toolDefs);
            totalPromptTokens += llmResponse.usage.promptTokens;
            totalCompletionTokens += llmResponse.usage.completionTokens;

            // If LLM returns text directly (no tool call) — use it as-is
            if (llmResponse.toolCalls.length === 0) {
                reply = llmResponse.content || 'Xin chào! Tôi có thể giúp gì cho bạn?';
            } else {
                // Tool-call loop: max 3 rounds
                for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
                    if (llmResponse.toolCalls.length === 0) {
                        // LLM finished with text — but we prefer deterministic response
                        // Only use LLM text if no tool was executed this iteration
                        if (!lastToolResult) {
                            reply = llmResponse.content || 'Đã xử lý yêu cầu.';
                        }
                        break;
                    }

                    const toolCall = llmResponse.toolCalls[0];
                    const execStart = Date.now();

                    // Execute tool
                    const toolResult = await this.toolRegistry.executeTool(
                        toolCall.name,
                        toolCall.arguments,
                        user,
                    );
                    toolsUsed.push(toolCall.name);
                    lastToolResult = toolResult;
                    lastToolName = toolCall.name;

                    // Audit log
                    await this.toolExecModel.create({
                        ownerId: new Types.ObjectId(user.ownerId),
                        conversationId: convOid,
                        toolName: toolCall.name,
                        input: toolCall.arguments,
                        output: toolResult.data,
                        status: toolResult.success ? 'success' : 'error',
                        errorMessage: toolResult.error,
                        executionTimeMs: Date.now() - execStart,
                    });

                    // Save tool message for history
                    await this.messageModel.create({
                        conversationId: convOid,
                        role: 'tool',
                        content: '',
                        toolCall: {
                            toolName: toolCall.name,
                            arguments: toolCall.arguments,
                            result: toolResult.data,
                        },
                    });

                    // Check if this is a WRITE tool (final action) or READ tool (may need chaining)
                    const isWriteTool = ['addRoom', 'addTenant', 'createContract'].includes(toolCall.name);

                    if (isWriteTool) {
                        // Write tools: deterministic response, NO more LLM calls
                        break;
                    }

                    // Read tools: feed result back to LLM for potential chaining
                    // (e.g., getRoomStatus → addRoom needs propertyId from result)
                    const toolResultStr = JSON.stringify(toolResult.data);
                    llmMessages.push({
                        role: 'assistant',
                        content: null,
                        tool_calls: [{
                            id: toolCall.id,
                            type: 'function',
                            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
                        }],
                    } as any);
                    llmMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: toolResultStr,
                    } as any);

                    // Next LLM call for chaining
                    llmResponse = await this.llmProvider.chat(llmMessages, toolDefs);
                    totalPromptTokens += llmResponse.usage.promptTokens;
                    totalCompletionTokens += llmResponse.usage.completionTokens;
                }

                // Generate deterministic response from last tool result
                if (lastToolResult && lastToolName) {
                    reply = this.toolRegistry.formatResponse(lastToolName, lastToolResult);
                } else {
                    reply = 'Đã xử lý yêu cầu.';
                }
            }
        } catch (err: unknown) {
            reply = this.handleLlmError(err);
            this.logger.error(`Agent error: ${err instanceof Error ? err.message : err}`);
        }

        // 6. Guarantee non-empty reply
        if (!reply || reply.trim() === '') {
            reply = 'Đã xử lý yêu cầu thành công.';
        }

        const responseTimeMs = Date.now() - startTime;

        // 7. Save assistant reply
        await this.messageModel.create({
            conversationId: convOid,
            role: 'assistant',
            content: reply,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
        });

        // 8. Auto-title on first message
        if (recentMessages.length <= 1) {
            const shortTitle = userMessage.length > 60 ? userMessage.substring(0, 60) + '...' : userMessage;
            await this.conversationModel.updateOne({ _id: convOid }, { title: shortTitle });
        }

        // 9. Record usage
        await this.usageTracking.recordUsage(
            user.ownerId,
            this.llmProvider.getModel(),
            totalPromptTokens,
            totalCompletionTokens,
            toolsUsed.length > 0,
        );

        return {
            reply,
            usage: {
                promptTokens: totalPromptTokens,
                completionTokens: totalCompletionTokens,
                responseTimeMs,
                toolsUsed,
                quota: { used: quota.used + 1, limit: quota.limit },
            },
        };
    }

    // ─── SSE Streaming Chat ─────────────────────────────────────

    /** Vietnamese labels for tool names shown in status updates */
    private readonly TOOL_LABELS: Record<string, string> = {
        getRoomStatus: 'tra cứu phòng',
        getBillSummary: 'tra cứu hoá đơn',
        getContractInfo: 'tra cứu hợp đồng',
        getTenantInfo: 'tra cứu khách thuê',
        getRevenue: 'tra cứu doanh thu',
        addRoom: 'tạo phòng mới',
        addTenant: 'thêm khách thuê',
        createContract: 'tạo hợp đồng',
    };

    /**
     * Streaming version of sendMessage().
     * Returns an Observable<MessageEvent> for NestJS SSE.
     * Emits: status → token(s) → done | error
     */
    sendMessageStream(
        conversationId: string,
        userMessage: string,
        user: UserPayload,
    ): Observable<MessageEvent> {
        const subject = new Subject<MessageEvent>();

        // Run the async streaming logic in the background
        this.runStreamingLoop(conversationId, userMessage, user, subject)
            .catch((err) => {
                this.logger.error(`Stream error: ${err instanceof Error ? err.message : err}`);
                subject.next({ data: { event: 'error', data: { message: this.handleLlmError(err) } } } as any);
                subject.complete();
            });

        return subject.asObservable();
    }

    private async runStreamingLoop(
        conversationId: string,
        userMessage: string,
        user: UserPayload,
        subject: Subject<MessageEvent>,
    ): Promise<void> {
        const startTime = Date.now();
        const convOid = new Types.ObjectId(conversationId);

        // Helper to emit SSE
        const emit = (event: StreamEvent) => {
            subject.next({ data: event } as any);
        };

        // 1. Verify ownership
        const conv = await this.conversationModel
            .findOne({ _id: convOid, ownerId: new Types.ObjectId(user.ownerId), status: 'active' })
            .lean();
        if (!conv) {
            emit({ event: 'error', data: { message: 'Cuộc hội thoại không tìm thấy.' } });
            subject.complete();
            return;
        }

        // 2. Check quota
        const subscription = await this.subscriptionService.getMySubscription(user.ownerId);
        const quota = await this.usageTracking.hasExceededQuota(user.ownerId, subscription.plan);
        if (quota.exceeded) {
            const info = quota.windowHours
                ? `${quota.limit} câu hỏi AI trong ${quota.windowHours} giờ qua`
                : `${quota.limit} câu hỏi AI trong tháng này`;
            emit({ event: 'error', data: { message: `Bạn đã sử dụng hết ${info}. Nâng cấp gói để có thêm lượt.` } });
            subject.complete();
            return;
        }

        // 3. Save user message
        await this.messageModel.create({ conversationId: convOid, role: 'user', content: userMessage });

        // 4. Build LLM context
        const recentMessages = await this.messageModel
            .find({ conversationId: convOid })
            .sort({ createdAt: -1 })
            .limit(MAX_CONTEXT_MESSAGES)
            .lean();

        const llmMessages: OpenAI.ChatCompletionMessageParam[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...recentMessages
                .reverse()
                .filter((m) => m.role === 'user' || m.role === 'assistant')
                .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content || '' })),
        ];

        // 5. Streaming agent loop
        const toolDefs = this.toolRegistry.getToolDefinitions();
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        const toolsUsed: string[] = [];
        let lastToolResult: ToolResult | null = null;
        let lastToolName: string | null = null;
        let reply = '';

        try {
            emit({ event: 'status', data: { text: 'Đang phân tích yêu cầu...' } });

            // Initial streaming LLM call
            let streamedText = '';
            let toolCalls: Array<{ id: string; name: string; arguments: Record<string, any> }> = [];

            for await (const chunk of this.llmProvider.chatStream(llmMessages, toolDefs)) {
                if (chunk.type === 'text-delta') {
                    streamedText += chunk.text;
                    emit({ event: 'token', data: { text: chunk.text } });
                } else if (chunk.type === 'tool-call') {
                    toolCalls.push(chunk);
                } else if (chunk.type === 'usage') {
                    totalPromptTokens += chunk.promptTokens;
                    totalCompletionTokens += chunk.completionTokens;
                }
            }

            if (toolCalls.length === 0) {
                // LLM responded with text directly (no tools)
                reply = streamedText || 'Xin chào! Tôi có thể giúp gì cho bạn?';
            } else {
                // Tool-call loop: max MAX_TOOL_ROUNDS rounds
                for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
                    if (toolCalls.length === 0) {
                        if (!lastToolResult) {
                            reply = streamedText || 'Đã xử lý yêu cầu.';
                        }
                        break;
                    }

                    const toolCall = toolCalls[0];
                    const toolLabel = this.TOOL_LABELS[toolCall.name] || toolCall.name;
                    emit({ event: 'status', data: { text: `Đang ${toolLabel}...` } });

                    const execStart = Date.now();
                    const toolResult = await this.toolRegistry.executeTool(
                        toolCall.name, toolCall.arguments, user,
                    );
                    toolsUsed.push(toolCall.name);
                    lastToolResult = toolResult;
                    lastToolName = toolCall.name;

                    // Audit log
                    await this.toolExecModel.create({
                        ownerId: new Types.ObjectId(user.ownerId),
                        conversationId: convOid,
                        toolName: toolCall.name,
                        input: toolCall.arguments,
                        output: toolResult.data,
                        status: toolResult.success ? 'success' : 'error',
                        errorMessage: toolResult.error,
                        executionTimeMs: Date.now() - execStart,
                    });

                    await this.messageModel.create({
                        conversationId: convOid,
                        role: 'tool',
                        content: '',
                        toolCall: {
                            toolName: toolCall.name,
                            arguments: toolCall.arguments,
                            result: toolResult.data,
                        },
                    });

                    // Write tools: deterministic response, no more LLM calls
                    const isWriteTool = ['addRoom', 'addTenant', 'createContract'].includes(toolCall.name);
                    if (isWriteTool) break;

                    // Feed tool result back to LLM for chaining
                    const toolResultStr = JSON.stringify(toolResult.data);
                    llmMessages.push({
                        role: 'assistant',
                        content: null,
                        tool_calls: [{
                            id: toolCall.id,
                            type: 'function',
                            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
                        }],
                    } as any);
                    llmMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: toolResultStr,
                    } as any);

                    // Next round: stream LLM response
                    emit({ event: 'status', data: { text: 'Đang tạo phản hồi...' } });
                    streamedText = '';
                    toolCalls = [];

                    for await (const chunk of this.llmProvider.chatStream(llmMessages, toolDefs)) {
                        if (chunk.type === 'text-delta') {
                            streamedText += chunk.text;
                            emit({ event: 'token', data: { text: chunk.text } });
                        } else if (chunk.type === 'tool-call') {
                            toolCalls.push(chunk);
                        } else if (chunk.type === 'usage') {
                            totalPromptTokens += chunk.promptTokens;
                            totalCompletionTokens += chunk.completionTokens;
                        }
                    }
                }

                // Generate deterministic response from last tool result
                if (lastToolResult && lastToolName) {
                    const formatted = this.toolRegistry.formatResponse(lastToolName, lastToolResult);
                    // If we already streamed text, use that; otherwise use deterministic
                    if (!streamedText.trim()) {
                        reply = formatted;
                        // Emit the deterministic reply as tokens for typewriter effect
                        const words = formatted.split(/(\s+)/);
                        for (const word of words) {
                            if (word) emit({ event: 'token', data: { text: word } });
                        }
                    } else {
                        reply = streamedText;
                    }
                } else if (streamedText.trim()) {
                    reply = streamedText;
                } else {
                    reply = 'Đã xử lý yêu cầu.';
                }
            }
        } catch (err: unknown) {
            reply = this.handleLlmError(err);
            this.logger.error(`Stream agent error: ${err instanceof Error ? err.message : err}`);
            emit({ event: 'error', data: { message: reply } });
            subject.complete();
            return;
        }

        // 6. Guarantee non-empty reply
        if (!reply || reply.trim() === '') {
            reply = 'Đã xử lý yêu cầu thành công.';
        }

        const responseTimeMs = Date.now() - startTime;

        // 7. Save assistant reply
        await this.messageModel.create({
            conversationId: convOid,
            role: 'assistant',
            content: reply,
            promptTokens: totalPromptTokens,
            completionTokens: totalCompletionTokens,
        });

        // 8. Auto-title on first message
        if (recentMessages.length <= 1) {
            const shortTitle = userMessage.length > 60 ? userMessage.substring(0, 60) + '...' : userMessage;
            await this.conversationModel.updateOne({ _id: convOid }, { title: shortTitle });
        }

        // 9. Record usage
        await this.usageTracking.recordUsage(
            user.ownerId,
            this.llmProvider.getModel(),
            totalPromptTokens,
            totalCompletionTokens,
            toolsUsed.length > 0,
        );

        // 10. Emit done event
        emit({
            event: 'done',
            data: {
                reply,
                usage: {
                    promptTokens: totalPromptTokens,
                    completionTokens: totalCompletionTokens,
                    responseTimeMs,
                    toolsUsed,
                    quota: { used: quota.used + 1, limit: quota.limit },
                },
            },
        });

        subject.complete();
    }

    // ─── Error Handling ───────────────────────────────────────────

    private handleLlmError(err: unknown): string {
        const msg = err instanceof Error ? err.message : String(err);

        if (msg.includes('401') || msg.includes('Incorrect API key')) {
            return 'API key không hợp lệ. Vui lòng liên hệ quản trị viên.';
        }
        if (msg.includes('429') || msg.includes('Rate limit')) {
            return 'Hệ thống AI đang bận. Vui lòng thử lại sau 30 giây.';
        }
        if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
            return 'Yêu cầu AI bị quá thời gian. Vui lòng thử lại.';
        }
        return 'Dịch vụ AI tạm thời gián đoạn. Vui lòng thử lại sau.';
    }

    // ─── Usage ──────────────────────────────────────────────────

    async getUsage(user: UserPayload) {
        const subscription = await this.subscriptionService.getMySubscription(user.ownerId);
        const usage = await this.usageTracking.getCurrentUsage(user.ownerId);
        const quota = await this.usageTracking.hasExceededQuota(user.ownerId, subscription.plan);

        return {
            plan: subscription.plan,
            period: usage?.period || new Date().toISOString().slice(0, 7),
            requests: { used: quota.used, limit: quota.limit },
            tokens: {
                prompt: usage?.totalPromptTokens || 0,
                completion: usage?.totalCompletionTokens || 0,
            },
            estimatedCostUsd: usage?.estimatedCostUsd || 0,
            toolCallCount: usage?.toolCallCount || 0,
        };
    }
}
