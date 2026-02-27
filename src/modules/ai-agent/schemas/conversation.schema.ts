import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ timestamps: true })
export class Conversation {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    ownerId: Types.ObjectId;

    @Prop({ required: true, trim: true })
    title: string;

    @Prop({
        type: String,
        enum: ['active', 'archived'],
        default: 'active',
    })
    status: string;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);

ConversationSchema.index({ ownerId: 1, updatedAt: -1 });

// TTL: auto-remove archived conversations after 90 days
ConversationSchema.index(
    { updatedAt: 1 },
    {
        expireAfterSeconds: 90 * 24 * 3600,
        partialFilterExpression: { status: 'archived' },
    },
);
