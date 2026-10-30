import type { ChatMessage, ContentPart, ModelPort, ModelReply, ToolSpec } from "../application/model-port";

const BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_META_MODEL = "muse-spark-1.3";
/**
 * Only for a connection that has stopped answering: a model reasoning through a sung take can
 * think for most of a minute in one step, which is normal and must not be cut off.
 */
const TIMEOUT_MS = 180_000;
const TIMEOUT_MESSAGE = "The assistant took longer than three minutes to answer. Please try again.";

type MetaToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

/** Our provider-neutral messages in Meta's OpenAI-compatible Chat Completions format. */
function toMetaMessage(message: ChatMessage) {
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  if (message.role === "assistant") {
    const toolCalls: MetaToolCall[] = message.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: call.arguments },
    }));
    return { role: "assistant", content: message.content, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) };
  }
  if (message.role === "user" && typeof message.content !== "string") {
    return { role: "user", content: message.content.map(toMetaPart) };
  }
  return { role: message.role, content: message.content };
}

/** Meta's content parts: `image_url` for pictures, `file` for PDFs (both take data URLs). */
export function toMetaPart(part: ContentPart) {
  if (part.type === "image") return { type: "image_url", image_url: { url: part.dataUrl } };
  if (part.type === "file") return { type: "file", file: { filename: part.filename, file_data: part.dataUrl } };
  return part;
}

/**
 * Meta Model API adapter (server-only: it holds the API key). One tool call per turn keeps the
 * loop easy to follow and every edit validated against the latest revision. `reasoningEffort`
 * (minimal … max) trades thinking time for depth; the model's default is used when it is unset.
 */
export function createMetaModel(apiKey: string, model = DEFAULT_META_MODEL, reasoningEffort?: string): ModelPort {
  return {
    async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ModelReply> {
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: messages.map(toMetaMessage),
          tools: tools.map(({ name, description, parameters }) => ({
            type: "function",
            function: { name, description, parameters },
          })),
          parallel_tool_calls: false,
          ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "TimeoutError") throw new Error(TIMEOUT_MESSAGE);
        throw error;
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = body?.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : "";
        throw new Error(`The model request failed (${response.status})${detail}`);
      }
      const message = body?.choices?.[0]?.message ?? {};
      const toolCalls = ((message.tool_calls ?? []) as MetaToolCall[]).map((call) => ({
        id: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      }));
      const usage = body?.usage
        ? {
            inputTokens: Number(body.usage.prompt_tokens ?? 0),
            outputTokens: Number(body.usage.completion_tokens ?? 0),
            cachedInputTokens: Number(body.usage.prompt_tokens_details?.cached_tokens ?? 0),
          }
        : undefined;
      return { content: message.content ?? null, toolCalls, usage };
    },
  };
}
