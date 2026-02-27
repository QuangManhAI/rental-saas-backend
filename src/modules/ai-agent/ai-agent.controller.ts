import {
    Controller,
    Post,
    Get,
    Delete,
    Body,
    Param,
    UseGuards,
    Req,
    HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AiAccessGuard } from './guards/ai-access.guard';
import { AiAgentService } from './ai-agent.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateConversationDto } from './dto/create-conversation.dto';

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
