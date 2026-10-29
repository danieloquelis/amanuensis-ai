import type { AssistantResult } from "../application/run-assistant";

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

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
}
