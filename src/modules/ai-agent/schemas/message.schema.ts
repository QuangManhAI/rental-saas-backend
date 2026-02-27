import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
    @Prop({ type: Types.ObjectId, ref: 'Conversation', required: true, index: true })
    conversationId: Types.ObjectId;

    @Prop({ required: true, enum: ['user', 'assistant', 'system', 'tool'] })
    role: string;

    /** Required for user/assistant. Optional for tool (tool results stored in toolCall). */
    @Prop({ type: String, default: '' })
    content: string;

    @Prop({ type: Object })
    toolCall?: {
        toolName: string;
        arguments: Record<string, any>;
        result?: any;
    };

    @Prop({ type: Number })
    promptTokens?: number;

    @Prop({ type: Number })
    completionTokens?: number;
}

export const MessageSchema = SchemaFactory.createForClass(Message);

MessageSchema.index({ conversationId: 1, createdAt: 1 });
