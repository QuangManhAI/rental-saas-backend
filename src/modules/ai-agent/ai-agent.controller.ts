import {
    Controller,
    Post,
    Get,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
    Res,
    HttpCode,
    Header,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiAccessGuard } from './guards/ai-access.guard';
import { AiAgentService } from './ai-agent.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';
import type { Response } from 'express';

@Controller('agent')
@UseGuards(AuthGuard('jwt'), AiAccessGuard)
export class AiAgentController {
    constructor(private readonly agentService: AiAgentService) { }

    // ─── Conversations ──────────────────────────────────────────

    @Post('conversations')
    async createConversation(
        @Req() req: any,
        @Body() dto: CreateConversationDto,
    ) {
        return this.agentService.createConversation(req.user, dto.title);
    }

    @Get('conversations')
    async listConversations(@Req() req: any) {
        return this.agentService.listConversations(req.user);
    }

    @Delete('conversations/:id')
    @HttpCode(200)
    async deleteConversation(@Param('id') id: string, @Req() req: any) {
        return this.agentService.deleteConversation(id, req.user);
    }

    // ─── Messages ───────────────────────────────────────────────

    @Post('conversations/:id/messages')
    async sendMessage(
        @Param('id') id: string,
        @Body() dto: SendMessageDto,
        @Req() req: any,
    ) {
        return this.agentService.sendMessage(id, dto.message, req.user);
    }

    /**
     * SSE streaming endpoint — returns Server-Sent Events.
     * Frontend connects via fetch() and reads the stream for typewriter effect.
     */
    @Post('conversations/:id/messages/stream')
    async sendMessageStream(
        @Param('id') id: string,
        @Body() dto: SendMessageDto,
        @Req() req: any,
        @Res() res: Response,
    ) {
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
        res.flushHeaders();

        const observable = this.agentService.sendMessageStream(id, dto.message, req.user);

        const subscription = observable.subscribe({
            next: (event: any) => {
                const eventData = event.data;
                res.write(`data: ${JSON.stringify(eventData)}\n\n`);
            },
            error: (err) => {
                const errorPayload = { event: 'error', data: { message: 'Lỗi hệ thống.' } };
                res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
                res.end();
            },
            complete: () => {
                res.end();
            },
        });

        // Handle client disconnect (abort)
        req.on('close', () => {
            subscription.unsubscribe();
        });
    }

    @Get('conversations/:id/messages')
    async getMessages(@Param('id') id: string, @Req() req: any) {
        return this.agentService.getMessages(id, req.user);
    }

    // ─── Usage ──────────────────────────────────────────────────

    @Get('usage')
    async getUsage(@Req() req: any) {
        return this.agentService.getUsage(req.user);
    }
}
