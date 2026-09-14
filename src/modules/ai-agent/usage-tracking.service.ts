import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiUsage, AiUsageDocument } from './schemas/ai-usage.schema';
import { Message, MessageDocument } from './schemas/message.schema';
import dayjs from 'dayjs';

/** Estimated pricing per 1M tokens (USD) — update as LLM providers change pricing */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
    'deepseek-v4-flash': { input: 0.10, output: 0.30 },
    'deepseek-chat': { input: 0.14, output: 0.28 },
    'deepseek-reasoner': { input: 0.55, output: 2.19 },
    'gpt-5-nano': { input: 0.10, output: 0.40 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.0 },
};

/** AI quota limits per subscription plan */
export const AI_PLAN_LIMITS: Record<
    string,
    {
        enabled: boolean;
        requestsPerMonth: number;
        /** Time-window limit (for free plan): max requests within windowHours */
        requestsPerWindow?: number;
        windowHours?: number;
    }
> = {
    free: { enabled: true, requestsPerMonth: 0, requestsPerWindow: 3, windowHours: 5 },
    basic: { enabled: true, requestsPerMonth: 100 },
    pro: { enabled: true, requestsPerMonth: 1000 },
};

@Injectable()
export class UsageTrackingService {
    private readonly logger = new Logger(UsageTrackingService.name);

    constructor(
        @InjectModel(AiUsage.name)
        private readonly aiUsageModel: Model<AiUsageDocument>,
        @InjectModel(Message.name)
        private readonly messageModel: Model<MessageDocument>,
    ) { }

    /** Get current period string "YYYY-MM" */
    private getCurrentPeriod(): string {
        return dayjs().format('YYYY-MM');
    }

    /** Estimate cost in USD based on model and token counts */
    private estimateCost(
        model: string,
        promptTokens: number,
        completionTokens: number,
    ): number {
        const pricing = MODEL_PRICING[model] || MODEL_PRICING['deepseek-v4-flash'] || { input: 0.10, output: 0.30 };
        const inputCost = (promptTokens / 1_000_000) * pricing.input;
        const outputCost = (completionTokens / 1_000_000) * pricing.output;
        return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // 6 decimal places
    }

    /**
     * Record a request's token usage.
     * Uses findOneAndUpdate with $inc for atomic operation.
     */
    async recordUsage(
        ownerId: string,
        model: string,
        promptTokens: number,
        completionTokens: number,
        hadToolCall: boolean,
    ): Promise<void> {
        const period = this.getCurrentPeriod();
        const cost = this.estimateCost(model, promptTokens, completionTokens);

        await this.aiUsageModel.findOneAndUpdate(
            {
                ownerId: new Types.ObjectId(ownerId),
                period,
            },
            {
                $inc: {
                    totalRequests: 1,
                    totalPromptTokens: promptTokens,
                    totalCompletionTokens: completionTokens,
                    estimatedCostUsd: cost,
                    toolCallCount: hadToolCall ? 1 : 0,
                    [`modelBreakdown.${model}.requests`]: 1,
                    [`modelBreakdown.${model}.promptTokens`]: promptTokens,
                    [`modelBreakdown.${model}.completionTokens`]: completionTokens,
                    [`modelBreakdown.${model}.costUsd`]: cost,
                },
            },
            { upsert: true, new: true },
        );
    }

    /** Get current month's usage for an owner */
    async getCurrentUsage(ownerId: string): Promise<AiUsageDocument | null> {
        return this.aiUsageModel
            .findOne({
                ownerId: new Types.ObjectId(ownerId),
                period: this.getCurrentPeriod(),
            })
            .lean();
    }

    /**
     * Count assistant messages from this owner in the last N hours.
     * Used for free plan time-window quota.
     */
    private async getRecentRequestCount(
        ownerId: string,
        hours: number,
    ): Promise<number> {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);

        // Count conversations owned by this user, then count assistant messages
        const result = await this.messageModel.aggregate([
            {
                $lookup: {
                    from: 'conversations',
                    localField: 'conversationId',
                    foreignField: '_id',
                    as: 'conv',
                },
            },
            { $unwind: '$conv' },
            {
                $match: {
                    'conv.ownerId': new Types.ObjectId(ownerId),
                    role: 'assistant',
                    createdAt: { $gte: since },
                },
            },
            { $count: 'total' },
        ]);

        return result[0]?.total || 0;
    }

    /** Check if owner has exceeded their quota (monthly or time-window) */
    async hasExceededQuota(
        ownerId: string,
        plan: string,
    ): Promise<{ exceeded: boolean; used: number; limit: number; windowHours?: number }> {
        const limits = AI_PLAN_LIMITS[plan] || AI_PLAN_LIMITS['free'];
        if (!limits.enabled) {
            return { exceeded: true, used: 0, limit: 0 };
        }

        // Free plan: time-window based (3 requests per 5 hours)
        if (limits.requestsPerWindow && limits.windowHours) {
            const recentCount = await this.getRecentRequestCount(
                ownerId,
                limits.windowHours,
            );
            return {
                exceeded: recentCount >= limits.requestsPerWindow,
                used: recentCount,
                limit: limits.requestsPerWindow,
                windowHours: limits.windowHours,
            };
        }

        // Basic/Pro: monthly quota
        const usage = await this.getCurrentUsage(ownerId);
        const used = usage?.totalRequests || 0;

        return {
            exceeded: used >= limits.requestsPerMonth,
            used,
            limit: limits.requestsPerMonth,
        };
    }
}
