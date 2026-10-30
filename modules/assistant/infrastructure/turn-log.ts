import type { AssistantResult } from "../application/run-assistant";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
/** A rejection is cut to this length in the log: enough to see what was wrong. */
const ERROR_ROOM = 240;
/** A call's arguments are cut to this length in the log: enough to see which bars it wrote. */
const ARGUMENT_ROOM = 300;

/**
 * One line per answered turn, for the development server's log: what was selected, how many model
 * steps it took, how long the model thought in each, which tools it called, and the tokens.
 * Explains a slow turn, or one that acted on the wrong bar.
 */
export function logTurn(instruction: string, selection: string | undefined, body: unknown): void {
  const result = body as Partial<AssistantResult> | null;
  if (!result?.thinkingMs) return;
  const thought = result.thinkingMs.reduce((sum, ms) => sum + ms, 0);
  const tools = (result.trace ?? []).map((t) => `${t.tool}${t.ok ? "" : "✗"}`).join(", ") || "no tools";
  const usage = result.usage ? `${result.usage.inputTokens} in / ${result.usage.outputTokens} out` : "";
  console.log(
    `[assistant] "${instruction.slice(0, 60)}" [${selection ?? "nothing selected"}]: ${result.steps} steps, thought ${seconds(thought)} (${result.thinkingMs.map(seconds).join(" + ")}), ${tools}, ${usage}`,
  );
  // Each call with what it was given (shortened), and why a rejected one was rejected: what the
  // agent did step by step, and so where a slow turn's time went (a bar written twice shows here).
  for (const call of result.trace ?? []) {
    const args = call.arguments.replace(/\s+/g, " ").slice(0, ARGUMENT_ROOM);
    console.log(
      `  ${call.ok ? "·" : "✗"} ${call.tool} ${args}${call.ok ? "" : `\n    ${(call.error ?? "").slice(0, ERROR_ROOM)}`}`,
    );
  }
}
