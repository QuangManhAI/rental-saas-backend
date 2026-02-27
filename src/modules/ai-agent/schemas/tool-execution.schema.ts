import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ToolExecutionDocument = HydratedDocument<ToolExecution>;

@Schema({ timestamps: true })
export class ToolExecution {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    ownerId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true })
    conversationId: Types.ObjectId;

    @Prop({ required: true })
    toolName: string;

    @Prop({ type: Object })
    input: Record<string, any>;

    @Prop({ type: Object })
    output: Record<string, any>;

    @Prop({ required: true, enum: ['success', 'error', 'denied'] })
    status: string;

    @Prop()
    errorMessage?: string;

    @Prop({ type: Number })
    executionTimeMs: number;

    @Prop({ type: [String], default: [] })
    accessedResources: string[];
}

export const ToolExecutionSchema = SchemaFactory.createForClass(ToolExecution);

ToolExecutionSchema.index({ ownerId: 1, createdAt: -1 });
ToolExecutionSchema.index({ toolName: 1, status: 1 });
