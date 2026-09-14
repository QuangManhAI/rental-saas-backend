import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface LlmResponse {
    content: string | null;
    toolCalls: Array<{
        id: string;
        name: string;
        arguments: Record<string, any>;
    }>;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

@Injectable()
export class LlmProviderService {
    private readonly logger = new Logger(LlmProviderService.name);
    private readonly client: OpenAI;
    private readonly model: string;
    private readonly maxTokens: number;
    private readonly configured: boolean;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('openai.apiKey');
        const baseURL = this.configService.get<string>('openai.baseUrl') || 'https://api.deepseek.com';
        this.model = this.configService.get<string>('openai.model') || 'deepseek-v4-flash';
        this.maxTokens = this.configService.get<number>('openai.maxTokens') || 2000;
        this.configured = !!apiKey;

        if (!this.configured) {
            this.logger.warn('OPENAI_API_KEY / DEEPSEEK_API_KEY is not set — AI Agent will not work');
        }

        this.client = new OpenAI({
            apiKey: apiKey || 'not-set',
            baseURL,
            timeout: 30_000,  // 30s hard timeout
            maxRetries: 1,    // 1 automatic retry on transient errors
        });
    }

    async chat(
        messages: OpenAI.ChatCompletionMessageParam[],
        tools?: OpenAI.ChatCompletionTool[],
    ): Promise<LlmResponse> {
        if (!this.configured) {
            throw new Error('LLM API key is not configured');
        }

        const params: OpenAI.ChatCompletionCreateParams = {
            model: this.model,
            messages,
            max_tokens: this.maxTokens,
        };

        if (tools && tools.length > 0) {
            params.tools = tools;
            params.tool_choice = 'auto';
        }

        const response = await this.client.chat.completions.create(params);
        const choice = response.choices?.[0];

        if (!choice) {
            throw new Error('DeepSeek returned empty choices');
        }

        const toolCalls = (choice.message.tool_calls || []).map((tc: any) => {
            let args: Record<string, any> = {};
            try {
                args = JSON.parse(tc.function?.arguments || '{}');
            } catch {
                this.logger.warn(`Failed to parse tool args for ${tc.function?.name}: ${tc.function?.arguments}`);
            }
            return { id: tc.id, name: tc.function?.name || 'unknown', arguments: args };
        });

        return {
            content: choice.message.content,
            toolCalls,
            usage: {
                promptTokens: response.usage?.prompt_tokens || 0,
                completionTokens: response.usage?.completion_tokens || 0,
                totalTokens: response.usage?.total_tokens || 0,
            },
        };
    }

    /**
     * Streaming variant — yields text deltas & tool calls as they arrive.
     * Used by the SSE endpoint so the frontend can render a typewriter effect.
     */
    async *chatStream(
        messages: OpenAI.ChatCompletionMessageParam[],
        tools?: OpenAI.ChatCompletionTool[],
    ): AsyncGenerator<StreamChunk> {
        if (!this.configured) {
            throw new Error('LLM API key is not configured');
        }

        const params: OpenAI.ChatCompletionCreateParams = {
            model: this.model,
            messages,
            max_tokens: this.maxTokens,
            stream: true,
            stream_options: { include_usage: true },
        };

        if (tools && tools.length > 0) {
            params.tools = tools;
            params.tool_choice = 'auto';
        }

        const stream = await this.client.chat.completions.create(params);

        // Accumulators for tool calls (they arrive in pieces across multiple chunks)
        const toolCallAccum: Map<number, { id: string; name: string; argsJson: string }> = new Map();
        let promptTokens = 0;
        let completionTokens = 0;

        for await (const chunk of stream as any) {
            const delta = chunk.choices?.[0]?.delta;

            // Aggregate usage from the final chunk
            if (chunk.usage) {
                promptTokens = chunk.usage.prompt_tokens || 0;
                completionTokens = chunk.usage.completion_tokens || 0;
            }

            if (!delta) continue;

            // Text content delta
            if (delta.content) {
                yield { type: 'text-delta', text: delta.content };
            }

            // Tool call deltas — accumulate pieces
            if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolCallAccum.has(idx)) {
                        toolCallAccum.set(idx, { id: tc.id || '', name: tc.function?.name || '', argsJson: '' });
                    }
                    const acc = toolCallAccum.get(idx)!;
                    if (tc.id) acc.id = tc.id;
                    if (tc.function?.name) acc.name = tc.function.name;
                    if (tc.function?.arguments) acc.argsJson += tc.function.arguments;
                }
            }

            // Check if this is the final chunk (finish_reason present)
            const finishReason = chunk.choices?.[0]?.finish_reason;
            if (finishReason === 'tool_calls' || (finishReason === 'stop' && toolCallAccum.size > 0)) {
                // Emit accumulated tool calls
                for (const [, tc] of toolCallAccum) {
                    let args: Record<string, any> = {};
                    try {
                        args = JSON.parse(tc.argsJson || '{}');
                    } catch {
                        this.logger.warn(`Failed to parse streamed tool args for ${tc.name}`);
                    }
                    yield { type: 'tool-call', id: tc.id, name: tc.name, arguments: args };
                }
            }
        }

        // Emit usage at the end
        yield {
            type: 'usage',
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
        };
    }

    getModel(): string {
        return this.model;
    }
}

export type StreamChunk =
    | { type: 'text-delta'; text: string }
    | { type: 'tool-call'; id: string; name: string; arguments: Record<string, any> }
    | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens: number };
