import type { ChatMessage, ModelPort, ModelReply, ToolSpec } from "../application/model-port";

const BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_META_MODEL = "muse-spark-1.3";
const TIMEOUT_MS = 45_000;

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
  return { role: message.role, content: message.content };
}

/**
 * Meta Model API adapter (server-only: it holds the API key). One tool call per turn keeps the
 * loop easy to follow and every edit validated against the latest revision.
 */
export function createMetaModel(apiKey: string, model = DEFAULT_META_MODEL): ModelPort {
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
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
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
