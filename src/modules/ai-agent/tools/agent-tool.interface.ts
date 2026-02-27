import { UserPayload } from '../../../shared/types';

export interface ToolResult {
    success: boolean;
    data: Record<string, any>;
    error?: string;
}

/**
 * Level-1 Controlled Agent tool interface.
 *
 * LLM selects tools + extracts parameters.
 * Backend executes and generates final response deterministically via formatResponse().
 */
export interface AgentTool {
    /** Unique tool name, e.g. "getRoomStatus" */
    readonly name: string;

    /** OpenAI function-calling definition */
    readonly definition: {
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, any>;
        };
    };

    /** Execute the tool with validated arguments */
    execute(
        args: Record<string, any>,
        user: UserPayload,
    ): Promise<ToolResult>;

    /**
     * Deterministically format a Vietnamese response from the tool result.
     * Called by the agent loop INSTEAD of asking the LLM to summarize.
     */
    formatResponse(result: ToolResult): string;
}
