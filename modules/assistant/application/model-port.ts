/** A tool call requested by the model; `arguments` is the raw JSON text it produced. */
export type ToolCall = { id: string; name: string; arguments: string };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type ToolSpec = { name: string; description: string; parameters: unknown };

/** Tokens a call used, when the provider reports them (the cost of a turn). */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache (billed far lower). */
  cachedInputTokens?: number;
};

export type ModelReply = { content: string | null; toolCalls: ToolCall[]; usage?: TokenUsage };

/**
 * Port to a tool-calling chat model. Implemented by provider adapters (Meta) and by scripted
 * fakes in tests; nothing in the assistant depends on a provider's wire format.
 */
export interface ModelPort {
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply>;
}
