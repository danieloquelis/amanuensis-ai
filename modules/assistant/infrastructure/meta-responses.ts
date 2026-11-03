import type { ChatMessage, ContentPart, ModelReply, ToolSpec } from "../application/model-port";
import { endedEarly } from "./model-retry";
import { settledReply } from "./tool-call-markup";

// Meta's Responses API (`/v1/responses`): unlike Chat Completions, it streams the reply's text
// while tools are offered, so the editor can draw bars as they are written, and it can carry the
// model's reasoning from one step to the next. Nothing is stored at Meta: the reasoning comes
// back encrypted and is sent again with the conversation (Meta's recommended mode for agents).

type OutputItem =
  | { type: "message"; content?: { type: string; text?: string }[] }
  | { type: "reasoning"; id?: string; summary?: unknown[]; encrypted_content?: string }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: string };
type ResponseBody = {
  output?: OutputItem[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  error?: { message?: string } | null;
};
type StreamEvent = { type: string; delta?: string; response?: ResponseBody; message?: string };

const toPart = (part: ContentPart) =>
  part.type === "text"
    ? { type: "input_text", text: part.text }
    : part.type === "image"
      ? { type: "input_image", image_url: part.dataUrl }
      : { type: "input_file", filename: part.filename, file_data: part.dataUrl };

/**
 * A past tool call's arguments as Meta will take them back. The model sometimes writes a call
 * with empty or broken arguments; its tool already answered with an error, but sending that text
 * again makes Meta refuse the whole next request (400, "`arguments` must be valid JSON").
 */
export function replayedArguments(text: string): string {
  try {
    JSON.parse(text);
    return text;
  } catch {
    return "{}";
  }
}

/** Our provider-neutral request as a Responses API body: system prompt as instructions, the rest as input items. */
export function responsesRequest(messages: ChatMessage[], tools: ToolSpec[]) {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const input = messages.flatMap((message): unknown[] => {
    if (message.role === "system") return [];
    if (message.role === "tool")
      return [{ type: "function_call_output", call_id: message.toolCallId, output: message.content }];
    if (message.role === "assistant") {
      const said = Boolean(message.content || message.toolCalls.length);
      return [
        // Reasoning must be followed by what it led to, a message or a call.
        ...(said ? (message.reasoning ?? []) : []),
        ...(message.content ? [{ role: "assistant", content: message.content }] : []),
        ...message.toolCalls.map((call) => ({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: replayedArguments(call.arguments),
        })),
      ];
    }
    return [
      { role: "user", content: typeof message.content === "string" ? message.content : message.content.map(toPart) },
    ];
  });
  const functions = tools.map(({ name, description, parameters }) => ({
    type: "function",
    name,
    description,
    parameters,
  }));
  return { instructions, input, tools: functions, store: false, include: ["reasoning.encrypted_content"] };
}

/** A message item's text. */
const messageText = (item: OutputItem) =>
  ("content" in item && item.type === "message" ? (item.content ?? []) : [])
    .map((part) => (part.type === "output_text" ? (part.text ?? "") : ""))
    .join("");

/**
 * A finished response in our provider-neutral shape. `offered` names the tools the call offered:
 * a call to one of them written as text is made as a call (see `tool-call-markup.ts`).
 */
export function responseReply(body: ResponseBody, offered: string[] = []): ModelReply {
  if (body.error?.message) throw new Error(`The model request failed: ${body.error.message.slice(0, 200)}`);
  const output = body.output ?? [];
  const calls = output
    .filter((item): item is Extract<OutputItem, { type: "function_call" }> => item.type === "function_call")
    .map((item) => ({ id: item.call_id, name: item.name, arguments: item.arguments }));
  const messages = output.filter((item) => item.type === "message").map(messageText);
  const { content, toolCalls } = settledReply(messages, calls, offered);
  const usage = body.usage
    ? {
        inputTokens: Number(body.usage.input_tokens ?? 0),
        outputTokens: Number(body.usage.output_tokens ?? 0),
        cachedInputTokens: Number(body.usage.input_tokens_details?.cached_tokens ?? 0),
      }
    : undefined;
  // Replayed whole, as Meta asks: encrypted content, an empty summary when there is none, the ID.
  const reasoning = output
    .filter((item): item is Extract<OutputItem, { type: "reasoning" }> => item.type === "reasoning")
    .filter((item) => item.encrypted_content)
    .map(({ id, summary, encrypted_content }) => ({
      type: "reasoning",
      id,
      summary: summary ?? [],
      encrypted_content,
    }));
  return { content, toolCalls, usage, ...(reasoning.length ? { reasoning } : {}) };
}

/**
 * Reads a streamed response (server-sent events): its text, passed on piece by piece as it is
 * written (`onText`), its reasoning summary likewise (`onThought`), then the finished response.
 * `onChunk` hears every chunk, for an idle timeout; `offered` names the tools offered (see `responseReply`).
 */
export async function readResponsesStream(
  response: Response,
  onText: (text: string) => void = () => {},
  onChunk: () => void = () => {},
  onThought: (text: string) => void = () => {},
  offered: string[] = [],
): Promise<ModelReply> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  let finished: ResponseBody | null = null;
  let textSent = false;
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
      if (!data || data === "[DONE]") continue;
      const event = JSON.parse(data) as StreamEvent;
      if (event.type === "response.reasoning_summary_text.delta" && event.delta) onThought(event.delta);
      // Each summary part is a thought of its own.
      else if (event.type === "response.reasoning_summary_text.done") onThought("\n\n");
      else if (event.type === "response.output_text.delta" && event.delta) {
        textSent = true;
        onText(event.delta);
      } else if (event.type === "response.completed" && event.response) finished = event.response;
      else if (event.type === "response.failed" || event.type === "error") {
        const message = event.response?.error?.message ?? event.message ?? "the response failed";
        throw new Error(`The model request failed: ${String(message).slice(0, 200)}`);
      }
    }
  }
  if (!finished) throw endedEarly(textSent);
  return responseReply(finished, offered);
}
