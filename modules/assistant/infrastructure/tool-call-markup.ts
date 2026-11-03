import type { ToolCall } from "../application/model-port";

// Muse Spark sometimes writes a tool call as text, in its own markup, instead of making a
// structured function call; Meta's docs don't describe it. Seen when a step offered no tools
// (or not the one it wanted), where one response then holds a message per call it tried:
//
//   <atem:function_calls><atem:invoke name="assistant_plan">
//     <atem:parameter name="steps">[{"done": true, "text": "…"}]</atem:parameter>
//   </atem:invoke></atem:function_calls>
//
// That text is never an answer for the musician. A call to a tool the step offered is made as
// the model meant it; the rest is dropped.

/** A block of calls, up to its end or the end of the text (a reply cut off mid-call). */
const CALLS = /<([\w-]+:)?function_calls>([\s\S]*?)(?:<\/\1function_calls>|$)/g;
const INVOKE = /<(?:[\w-]+:)?invoke\s+name="([^"]+)"\s*\/?>([\s\S]*?)(?:<\/(?:[\w-]+:)?invoke>|$)/g;
const PARAMETER = /<(?:[\w-]+:)?parameter\s+name="([^"]+)"\s*>([\s\S]*?)<\/(?:[\w-]+:)?parameter>/g;

/** A parameter's value: JSON where it reads as JSON (a list, a number), else the text itself. */
function parameterValue(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

type WrittenCall = { name: string; arguments: string };

/** The calls written as markup in a text, and the text without them. */
export function readToolMarkup(text: string): { text: string; calls: WrittenCall[] } {
  const calls: WrittenCall[] = [];
  const rest = text.replace(CALLS, (_block, _prefix, inner: string) => {
    for (const [, name, body] of inner.matchAll(INVOKE)) {
      const args = Object.fromEntries(
        [...body.matchAll(PARAMETER)].map(([, key, value]) => [key, parameterValue(value)]),
      );
      calls.push({ name, arguments: JSON.stringify(args) });
    }
    return "";
  });
  return { text: rest.trim(), calls };
}

/**
 * What a response's messages (in order) and its function calls come to: the last message is the
 * reply (earlier ones in the same response narrate steps the model tried, and are not glued on),
 * with no call markup left in it. When the model made no real call, the calls it wrote as markup
 * to tools this step offered are made instead.
 */
export function settledReply(
  messages: string[],
  toolCalls: ToolCall[],
  offered: string[],
): { content: string | null; toolCalls: ToolCall[] } {
  const read = messages.map(readToolMarkup);
  const said = read.map((message) => message.text).filter(Boolean);
  // A call it wrote again (trying once more) is made once.
  const distinct = new Map(read.flatMap((message) => message.calls).map((call) => [JSON.stringify(call), call]));
  const written = [...distinct.values()]
    .filter((call) => offered.includes(call.name))
    .map((call) => ({ id: `call_markup_${crypto.randomUUID().slice(0, 8)}`, ...call }));
  return { content: said.at(-1) ?? null, toolCalls: toolCalls.length ? toolCalls : written };
}
