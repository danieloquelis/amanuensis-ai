import { commandSchema, resolvePositions, writeBars, type Operation, type Score } from "@/modules/score";
import type { ToolCall } from "./model-port";
import type { createScoreToolGateway } from "./score-tool-gateway";

const REQUEST_ID_ROOM = 40;

type Gateway = ReturnType<typeof createScoreToolGateway>;
type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string };
/** The heard-bars guard: why an edit to just-transcribed bars is refused, or null. */
export type RefuseEdit = (operation: Operation, asked: string | undefined) => string | null;

export function parseArguments(call: ToolCall): unknown {
  try {
    return JSON.parse(call.arguments || "{}");
  } catch {
    return undefined;
  }
}

/** Prefixes the model's request ID with the turn ID so IDs never collide across turns. */
function namespaced(args: unknown, turnId: string): unknown {
  if (typeof args !== "object" || args === null || !("requestId" in args)) return args;
  const requestId =
    String(args.requestId)
      .replace(/[^\w-]/g, "")
      .slice(0, REQUEST_ID_ROOM) || "edit";
  return { ...args, requestId: `${turnId}-${requestId}` };
}

/**
 * Executes one score tool through the gateway, which records what it changes for the replay.
 * Edits may name notes and bars by position; they are resolved against the current score first,
 * so the heard-bars guard and the replayed commands see real IDs.
 */
export function runScoreTool(
  call: ToolCall,
  tools: Gateway,
  turnId: string,
  score: () => Score,
  refuse: RefuseEdit,
): ToolResult {
  const parsed = parseArguments(call);
  if (parsed === undefined) return { ok: false, error: "Arguments were not valid JSON." };
  // `asked` (the musician's words) is for the heard-bars guard, not part of the command.
  const { asked, ...args } = parsed as { asked?: unknown };
  const quoted = typeof asked === "string" ? asked : undefined;
  if (call.name === "score_edit") {
    let command;
    try {
      command = commandSchema.safeParse(resolvePositions(score(), namespaced(args, turnId)));
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
    if (!command.success) return tools(call.name, args);
    const refusal = refuse(command.data.operation, quoted);
    if (refusal) return { ok: false, error: refusal };
    return tools(call.name, command.data);
  }
  if (call.name === "score_write") {
    const request = namespaced(args, turnId) as { requestId?: string; text?: unknown; pitches?: "written" };
    try {
      // The bars it would write go through the same guard as an edit.
      const id = request.requestId ?? `${turnId}-write`;
      const preview = writeBars(score(), String(request.text ?? ""), id, request.pitches);
      const refusal = refuse(preview.command.operation, quoted);
      if (refusal) return { ok: false, error: refusal };
    } catch (error) {
      return { ok: false, error: (error as Error).message };
    }
    return tools(call.name, request);
  }
  if (call.name !== "score_get_context" && call.name !== "score_undo") {
    return { ok: false, error: `Unknown tool ${call.name}.` };
  }
  return tools(call.name, parsed);
}
