import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AiUsageDocument = HydratedDocument<AiUsage>;

@Schema({ timestamps: true })
export class AiUsage {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    ownerId: Types.ObjectId;

    /** Format: "YYYY-MM", e.g. "2026-02" */
    @Prop({ required: true })
    period: string;

    @Prop({ default: 0 })
    totalRequests: number;

    @Prop({ default: 0 })
    totalPromptTokens: number;

    @Prop({ default: 0 })
    totalCompletionTokens: number;

    @Prop({ default: 0 })
    estimatedCostUsd: number;

    @Prop({ default: 0 })
    toolCallCount: number;

    @Prop({ type: Object, default: {} })
    modelBreakdown: Record<
        string,
        {
            requests: number;
            promptTokens: number;
            completionTokens: number;
            costUsd: number;
        }
    >;
}

export const AiUsageSchema = SchemaFactory.createForClass(AiUsage);

AiUsageSchema.index({ ownerId: 1, period: 1 }, { unique: true });
