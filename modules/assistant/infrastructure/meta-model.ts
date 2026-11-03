import type {
  ChatMessage,
  CompleteOptions,
  ContentPart,
  ModelPort,
  ModelReply,
  ToolSpec,
} from "../application/model-port";
import { thinkingBelow, type Thinking } from "../application/thinking";
import { readCompletionStream } from "./meta-stream";
import { readResponsesStream, replayedArguments, responseReply, responsesRequest } from "./meta-responses";
import { FIRST_RETRY_MS, isRetryStatus, retryAfterMs, TransientError, withRetries } from "./model-retry";

/**
 * Which Meta endpoint carries the conversation. The Responses API carries the model's reasoning
 * from step to step and streams text while tools are offered; Chat Completions does neither.
 * Measured on 1 November 2026 (docs/research/reasoning-continuity.md): as accurate, faster, cheaper.
 */
export type MetaApi = "chat" | "responses";

/** The API from a setting such as `META_AI_API`: Responses unless it says "chat". */
export const metaApi = (setting: string | undefined): MetaApi => (setting === "chat" ? "chat" : "responses");
/** `retryMs` is the first wait before another try (tests shorten it). */
/**
 * `parallelTools`: whether one reply may make several tool calls. Off for the agent, whose every
 * edit names the revision it read; on for the band's musicians, whose edits are fitted to the
 * score as it is when they run (a whole part in one reply).
 */
export type MetaSettings = { api?: MetaApi; idleMs?: number; retryMs?: number; parallelTools?: boolean };

const BASE_URL = "https://api.meta.ai/v1";
export const DEFAULT_META_MODEL = "muse-spark-1.3";
/**
 * Only for a connection that has stopped answering: a model reasoning through a sung take can
 * think for most of a minute in one step (sending nothing meanwhile), which is normal and must
 * not be cut off.
 */
const TIMEOUT_MS = 180_000;
/** "concise": a few sentences on the key steps ("auto" is about one; Meta's reasoning guide). */
const REASONING_SUMMARY = "concise";
/** How long Meta may keep a shared prefix cached: "in_memory" (the default) or "24h". */
const CACHE_RETENTION = "24h";
const TIMEOUT_MESSAGE = "The assistant went quiet for three minutes. Please try again.";
const UNREACHABLE_MESSAGE = "The assistant couldn't be reached. Please try again.";

/**
 * The prompt cache fields for a call that names its shared prefix: the key routes calls with the
 * same beginning to the same server, and "24h" asks Meta to keep that prefix past the default
 * in-memory lifetime (a hint, not a guarantee; Meta's prompt caching guide).
 */
const cacheFields = (cacheKey: string | undefined) =>
  cacheKey ? { prompt_cache_key: cacheKey, prompt_cache_retention: CACHE_RETENTION } : {};

type MetaToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

/** Our provider-neutral messages in Meta's OpenAI-compatible Chat Completions format. */
function toMetaMessage(message: ChatMessage) {
  if (message.role === "tool") return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  if (message.role === "assistant") {
    const toolCalls: MetaToolCall[] = message.toolCalls.map((call) => ({
      id: call.id,
      type: "function",
      function: { name: call.name, arguments: replayedArguments(call.arguments) },
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
 * Meta Model API adapter (server-only: it holds the API key). One tool call per reply (unless
 * `parallelTools`) keeps the loop easy to follow and every edit validated against the latest
 * revision. `reasoningEffort` (minimal … max) trades thinking time for depth; the model's default
 * is used when it is unset, and a call may ask for its own.
 * A call that fails before its answer begins (busy, a provider fault, a dropped connection) is
 * tried again a couple of times (see `model-retry.ts`).
 */
export function createMetaModel(
  apiKey: string,
  model = DEFAULT_META_MODEL,
  reasoningEffort?: string,
  { api = "responses", idleMs = TIMEOUT_MS, retryMs = FIRST_RETRY_MS, parallelTools = false }: MetaSettings = {},
): ModelPort {
  /** The endpoint and request body for one call on the chosen API. */
  const request = (
    messages: ChatMessage[],
    tools: ToolSpec[],
    { cacheKey, effort = reasoningEffort, responseFormat }: CompleteOptions,
  ) =>
    api === "responses"
      ? {
          url: `${BASE_URL}/responses`,
          body: {
            model,
            ...responsesRequest(messages, tools),
            ...cacheFields(cacheKey),
            // Structured output on the Responses API is `text.format` (`response_format` is a 400 there).
            ...(responseFormat ? { text: { format: { type: "json_schema", strict: true, ...responseFormat } } } : {}),
            parallel_tool_calls: parallelTools,
            stream: true,
            // A short summary of its reasoning streams back: the musician sees what it is weighing.
            reasoning: { summary: REASONING_SUMMARY, ...(effort ? { effort } : {}) },
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
            parallel_tool_calls: parallelTools,
            stream: true,
            stream_options: { include_usage: true },
            ...(effort ? { reasoning_effort: effort } : {}),
            ...cacheFields(cacheKey),
            ...(responseFormat
              ? { response_format: { type: "json_schema", json_schema: { strict: true, ...responseFormat } } }
              : {}),
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
      const { url, body } = request(messages, tools, options);
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
          ? await readResponsesStream(response, options.onText, alive, options.onThought)
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

/**
 * The models one request uses, from the server's settings and the thinking the musician chose:
 * the agent's, and (for Band Mode) the musicians', a level of thinking below it.
 */
export function createMetaModels(apiKey: string, env: Record<string, string | undefined>, thinking?: Thinking) {
  const settings = { api: metaApi(env.META_AI_API) };
  const effort = thinking ?? env.META_AI_REASONING_EFFORT;
  return {
    model: createMetaModel(apiKey, env.META_AI_MODEL, effort, settings),
    musicians: createMetaModel(apiKey, env.META_AI_MODEL, thinkingBelow(thinking), {
      ...settings,
      parallelTools: true,
    }),
  };
}
