/** A tool call requested by the model; `arguments` is the raw JSON text it produced. */
export type ToolCall = { id: string; name: string; arguments: string };

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export type ToolSpec = { name: string; description: string; parameters: unknown };

export type ModelReply = { content: string | null; toolCalls: ToolCall[] };

/**
 * Port to a tool-calling chat model. Implemented by provider adapters (Meta) and by scripted
 * fakes in tests; nothing in the assistant depends on a provider's wire format.
 */
export interface ModelPort {
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply>;
}
