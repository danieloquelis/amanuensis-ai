import type { ChatMessage, CompleteOptions, ModelPort, ModelReply, ToolCall, ToolSpec } from "./model-port";

// Guards that bound an agent loop beyond its step cap (Meta's agent loop cookbook): a model
// repeating the same call is stuck, and a reply with nothing in it is a failed call, not an answer.

/** The same tool call (name and arguments) this many replies in a row is a stuck loop. */
export const MAX_SAME_CALLS = 3;

/** How a turn ends when a guard (or the step cap) stops it. */
export const GUARD_REPLIES = {
  stuck:
    "I kept repeating the same step without getting anywhere, so I stopped; what I changed so far is applied (Undo takes it back).",
  outOfSteps: "I ran out of steps before finishing; what I changed so far is applied (Undo takes it back).",
  /** Its model calls came back empty, even when tried again, and it changed nothing. */
  noAnswer: "I didn't get an answer from the model. Please try again.",
};

/** JSON with its keys in a fixed order, so the same arguments compare equal however they were written. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries.map(([key, inner]) => [key, canonical(inner)]));
}

function callKey(call: ToolCall): string {
  try {
    return `${call.name} ${JSON.stringify(canonical(JSON.parse(call.arguments || "{}")))}`;
  } catch {
    return `${call.name} ${call.arguments}`;
  }
}

/**
 * Watches a loop's tool calls, reply by reply: true once the same calls (same names, same
 * arguments) have come `limit` times in a row. A reply with no calls breaks the run.
 */
export function createRepeatWatch(limit = MAX_SAME_CALLS) {
  let last = "";
  let times = 0;
  return (calls: ToolCall[]): boolean => {
    const key = calls.map(callKey).join("\n");
    times = key && key === last ? times + 1 : 1;
    last = key;
    return Boolean(key) && times >= limit;
  };
}

/** A reply with no text and no tool calls: nothing to show and nothing to do. */
export const isEmptyReply = (reply: ModelReply) => !reply.toolCalls.length && !reply.content?.trim();

/**
 * One model call, made again once if it comes back empty: Meta's guide treats an empty turn as a
 * transport failure, not the model's decision. Both calls' tokens count. A second empty reply is
 * returned as it is, for the caller to end on.
 */
export async function completeOrRetryEmpty(
  model: ModelPort,
  messages: ChatMessage[],
  tools: ToolSpec[],
  options: CompleteOptions,
): Promise<ModelReply> {
  const first = await model.complete(messages, tools, options);
  if (!isEmptyReply(first)) return first;
  const second = await model.complete(messages, tools, options);
  if (!first.usage) return second;
  const usage = {
    inputTokens: first.usage.inputTokens + (second.usage?.inputTokens ?? 0),
    outputTokens: first.usage.outputTokens + (second.usage?.outputTokens ?? 0),
    cachedInputTokens: (first.usage.cachedInputTokens ?? 0) + (second.usage?.cachedInputTokens ?? 0),
  };
  return { ...second, usage };
}
