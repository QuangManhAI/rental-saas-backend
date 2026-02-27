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
        this.model = this.configService.get<string>('openai.model') || 'gpt-5-nano';
        this.maxTokens = this.configService.get<number>('openai.maxTokens') || 2000;
        this.configured = !!apiKey;

        if (!this.configured) {
            this.logger.warn('OPENAI_API_KEY is not set — AI Agent will not work');
        }

        this.client = new OpenAI({
            apiKey: apiKey || 'not-set',
            timeout: 30_000,  // 30s hard timeout
            maxRetries: 1,    // 1 automatic retry on transient errors
        });
    }

    async chat(
        messages: OpenAI.ChatCompletionMessageParam[],
        tools?: OpenAI.ChatCompletionTool[],
    ): Promise<LlmResponse> {
        if (!this.configured) {
            throw new Error('OPENAI_API_KEY is not configured');
        }

        const params: OpenAI.ChatCompletionCreateParams = {
            model: this.model,
            messages,
            max_completion_tokens: this.maxTokens,
        };

        if (tools && tools.length > 0) {
            params.tools = tools;
            params.tool_choice = 'auto';
        }

        const response = await this.client.chat.completions.create(params);
        const choice = response.choices?.[0];

        if (!choice) {
            throw new Error('OpenAI returned empty choices');
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

    getModel(): string {
        return this.model;
    }
}
