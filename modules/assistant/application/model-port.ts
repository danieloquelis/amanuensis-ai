/** A tool call requested by the model; `arguments` is the raw JSON text it produced. */
export type ToolCall = { id: string; name: string; arguments: string };

/** Part of a user message: text, a picture, or a file such as a PDF (both as data URLs). */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; dataUrl: string }
  | { type: "file"; filename: string; dataUrl: string };

export type ChatMessage =
  | { role: "system"; content: string }
  /** Pictures and files ride only in user messages, as the model APIs require. */
  | { role: "user"; content: string | ContentPart[] }
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

export type CompleteOptions = {
  /** Cancels the call (the musician stopped the turn). */
  signal?: AbortSignal;
  /** Hears the reply's text piece by piece as it is written, before the call resolves. */
  onText?: (text: string) => void;
};

export type ModelReply = { content: string | null; toolCalls: ToolCall[]; usage?: TokenUsage };

/**
 * Port to a tool-calling chat model. Implemented by provider adapters (Meta) and by scripted
 * fakes in tests; nothing in the assistant depends on a provider's wire format.
 */
export interface ModelPort {
  complete(messages: ChatMessage[], tools: ToolSpec[], options?: CompleteOptions): Promise<ModelReply>;
}
