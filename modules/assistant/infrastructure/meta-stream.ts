import type { ModelReply, ToolCall } from "../application/model-port";
import { endedEarly } from "./model-retry";

type StreamChunk = {
  choices?: { delta?: { content?: string; tool_calls?: ToolCallDelta[] }; finish_reason?: string | null }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string };
};
type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };

/**
 * Reads a streamed Chat Completions answer (server-sent events) into one reply: the text, passed
 * on piece by piece as it arrives (`onText`), the tool calls, built from their pieces, and the
 * tokens used (sent with the last chunk). `onChunk` hears every chunk, for an idle timeout.
 * A stream that stops before its finish reason or `[DONE]` was cut off, and is not an answer.
 */
export async function readCompletionStream(
  response: Response,
  onText: (text: string) => void = () => {},
  onChunk: () => void = () => {},
): Promise<ModelReply> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  let content = "";
  const calls: ToolCall[] = [];
  let usage: ModelReply["usage"];
  let finished = false;
  const read = (chunk: StreamChunk) => {
    if (chunk.error) throw new Error(`The model request failed: ${String(chunk.error.message ?? "").slice(0, 200)}`);
    if (chunk.usage) {
      usage = {
        inputTokens: Number(chunk.usage.prompt_tokens ?? 0),
        outputTokens: Number(chunk.usage.completion_tokens ?? 0),
        cachedInputTokens: Number(chunk.usage.prompt_tokens_details?.cached_tokens ?? 0),
      };
    }
    if (chunk.choices?.[0]?.finish_reason) finished = true;
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.content) {
      content += delta.content;
      onText(delta.content);
    }
    for (const part of delta?.tool_calls ?? []) {
      const call = (calls[part.index ?? 0] ??= { id: "", name: "", arguments: "" });
      if (part.id) call.id = part.id;
      if (part.function?.name) call.name = part.function.name;
      if (part.function?.arguments) call.arguments += part.function.arguments;
    }
  };
  for (;;) {
    // A connection dropped mid-answer reads as its end, and is caught below as one cut off.
    const { value, done } = await reader.read().catch(() => ({ value: "", done: true }));
    if (done) break;
    onChunk();
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice("data:".length).trim() : "";
      if (data === "[DONE]") finished = true;
      else if (data) read(JSON.parse(data) as StreamChunk);
    }
  }
  if (!finished) throw endedEarly(content.length > 0);
  return { content: content || null, toolCalls: calls.filter(Boolean), usage };
}
