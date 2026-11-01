import type {
  ChatMessage,
  CompleteOptions,
  ContentPart,
  ModelPort,
  ModelReply,
  ToolSpec,
} from "../application/model-port";
import { readCompletionStream } from "./meta-stream";
import { readResponsesStream, responseReply, responsesRequest } from "./meta-responses";
import { FIRST_RETRY_MS, isRetryStatus, retryAfterMs, TransientError, withRetries } from "./model-retry";

/** Which Meta endpoint carries the conversation: Chat Completions, or the Responses API (streams text while tools are offered). */
export type MetaApi = "chat" | "responses";
/** `retryMs` is the first wait before another try (tests shorten it). */
export type MetaSettings = { api?: MetaApi; idleMs?: number; retryMs?: number };

const BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_META_MODEL = "muse-spark-1.3";
/**
 * Only for a connection that has stopped answering: a model reasoning through a sung take can
 * think for most of a minute in one step (sending nothing meanwhile), which is normal and must
 * not be cut off.
 */
const TIMEOUT_MS = 180_000;
const TIMEOUT_MESSAGE = "The assistant went quiet for three minutes. Please try again.";
const UNREACHABLE_MESSAGE = "The assistant couldn't be reached. Please try again.";

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
 * A call that fails before its answer begins (busy, a provider fault, a dropped connection) is
 * tried again a couple of times (see `model-retry.ts`).
 */
export function createMetaModel(
  apiKey: string,
  model = DEFAULT_META_MODEL,
  reasoningEffort?: string,
  { api = "chat", idleMs = TIMEOUT_MS, retryMs = FIRST_RETRY_MS }: MetaSettings = {},
): ModelPort {
  /** The endpoint and request body for one call on the chosen API. */
  const request = (messages: ChatMessage[], tools: ToolSpec[]) =>
    api === "responses"
      ? {
          url: `${BASE_URL}/responses`,
          body: {
            model,
            ...responsesRequest(messages, tools),
            parallel_tool_calls: false,
            stream: true,
            ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
          },
        }
      : {
          url: `${BASE_URL}/chat/completions`,
          body: {
            model,
            messages: messages.map(toMetaMessage),
            tools: tools.map(({ name, description, parameters }) => ({
              type: "function",
              function: { name, description, parameters },
            })),
            parallel_tool_calls: false,
            stream: true,
            stream_options: { include_usage: true },
            ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
          },
        };
  /** One try. The deadline counts from the last sign of life: an answer may take long, but not go quiet. */
  async function once(messages: ChatMessage[], tools: ToolSpec[], options: CompleteOptions): Promise<ModelReply> {
    const idle = new AbortController();
    let timer = setTimeout(() => idle.abort(new DOMException("idle", "TimeoutError")), idleMs);
    const alive = () => {
      clearTimeout(timer);
      timer = setTimeout(() => idle.abort(new DOMException("idle", "TimeoutError")), idleMs);
    };
    const signal = options.signal ? AbortSignal.any([options.signal, idle.signal]) : idle.signal;
    try {
      const { url, body } = request(messages, tools);
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      }).catch((error) => {
        // Not stopped by us: the network failed before an answer began.
        throw signal.aborted ? error : new TransientError(UNREACHABLE_MESSAGE);
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.error?.message ? `: ${String(body.error.message).slice(0, 200)}` : "";
        const message = `The model request failed (${response.status})${detail}`;
        if (isRetryStatus(response.status)) {
          throw new TransientError(message, retryAfterMs(response.headers.get("retry-after")));
        }
        throw new Error(message);
      }
      const streamed = response.headers.get("content-type")?.includes("text/event-stream");
      if (api === "responses") {
        return streamed
          ? await readResponsesStream(response, options.onText, alive)
          : responseReply(await response.json());
      }
      return streamed ? await readCompletionStream(response, options.onText, alive) : wholeReply(await response.json());
    } catch (error) {
      if (idle.signal.aborted && !options.signal?.aborted) throw new Error(TIMEOUT_MESSAGE);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    complete: (messages: ChatMessage[], tools: ToolSpec[], options: CompleteOptions = {}) =>
      withRetries(() => once(messages, tools, options), { signal: options.signal, firstDelayMs: retryMs }),
  };
}

/** A reply sent whole (not streamed), in our provider-neutral shape. */
function wholeReply(body: {
  choices?: { message?: { content?: string | null; tool_calls?: MetaToolCall[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
}): ModelReply {
  const message = body?.choices?.[0]?.message ?? {};
  const toolCalls = (message.tool_calls ?? []).map((call) => ({
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
}
