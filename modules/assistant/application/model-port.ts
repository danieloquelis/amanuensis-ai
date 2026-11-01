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
  /** `reasoning`: the provider's own record of the model's thinking for this reply, sent back as is. */
  | { role: "assistant"; content: string | null; toolCalls: ToolCall[]; reasoning?: unknown[] }
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
  /** Hears a summary of the model's reasoning piece by piece, where the provider gives one. */
  onThought?: (text: string) => void;
  /** Groups calls that share a beginning (one turn's steps), so the provider's prompt cache can reuse it. */
  cacheKey?: string;
};

/**
 * `reasoning` is the model's thinking for this reply, opaque (encrypted by the provider), when
 * the provider can carry it to the next step: keep it with the reply in the conversation.
 */
export type ModelReply = { content: string | null; toolCalls: ToolCall[]; usage?: TokenUsage; reasoning?: unknown[] };

/**
 * Port to a tool-calling chat model. Implemented by provider adapters (Meta) and by scripted
 * fakes in tests; nothing in the assistant depends on a provider's wire format.
 */
export interface ModelPort {
  complete(messages: ChatMessage[], tools: ToolSpec[], options?: CompleteOptions): Promise<ModelReply>;
}
