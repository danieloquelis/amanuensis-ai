import type { ModelReply, ToolCall } from "../application/model-port";

type StreamChunk = {
  choices?: { delta?: { content?: string; tool_calls?: ToolCallDelta[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string };
};
type ToolCallDelta = { index?: number; id?: string; function?: { name?: string; arguments?: string } };

/**
 * Reads a streamed Chat Completions answer (server-sent events) into one reply: the text, passed
 * on piece by piece as it arrives (`onText`), the tool calls, built from their pieces, and the
 * tokens used (sent with the last chunk). `onChunk` hears every chunk, for an idle timeout.
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
  const read = (chunk: StreamChunk) => {
    if (chunk.error) throw new Error(`The model request failed: ${String(chunk.error.message ?? "").slice(0, 200)}`);
    if (chunk.usage) {
      usage = {
        inputTokens: Number(chunk.usage.prompt_tokens ?? 0),
        outputTokens: Number(chunk.usage.completion_tokens ?? 0),
        cachedInputTokens: Number(chunk.usage.prompt_tokens_details?.cached_tokens ?? 0),
      };
    }
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
    const { value, done } = await reader.read();
    if (done) break;
    onChunk();
    buffered += value;
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice("data:".length).trim() : "";
      if (data && data !== "[DONE]") read(JSON.parse(data) as StreamChunk);
    }
  }
  return { content: content || null, toolCalls: calls.filter(Boolean), usage };
}
