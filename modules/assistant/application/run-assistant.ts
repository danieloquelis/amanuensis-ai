import { commandSchema, createSession, summarizeChange, type Command, type Score, type Session } from "@/modules/score";
import { describeTake, type VoiceTake } from "@/modules/voice";
import { ASK_TOOL, askSchema, assistantTools } from "./assistant-tools";
import { createMusicTools, isMusicTool, musicToolSpecs } from "./music-tools";
import type { ChatMessage, ModelPort, TokenUsage, ToolCall } from "./model-port";
import { createScoreToolGateway } from "./score-tool-gateway";
import { SYSTEM_PROMPT } from "./system-prompt";

/** Hard cap on model round trips per instruction. */
export const MAX_TOOL_STEPS = 8;
const REQUEST_ID_ROOM = 40;

export type AssistantTurn = { instruction: string; reply: string };

export type AssistantRequest = {
  instruction: string;
  score: Score;
  selectedIds: string[];
  /** Recent turns, oldest first, so follow-ups ("make it softer") have context. */
  history: AssistantTurn[];
  /** A recorded take: what was said (the instruction) and where singing happened. */
  take?: VoiceTake;
};

export type AssistantResult = {
  reply: string;
  question: { text: string; choices: string[] } | null;
  /** Commands committed this turn, in order; the editor replays them as one undo step. */
  commands: Command[];
  changes: string[];
  steps: number;
  /** Tokens used across the turn's model calls, when the provider reports them. */
  usage: TokenUsage;
  /** What the agent did, step by step: each tool call and whether it worked. For review. */
  trace: TraceEntry[];
};

export type TraceEntry = { tool: string; arguments: string; ok: boolean; error?: string };
/** Trace arguments are cut to this length: enough to judge a decision, small enough to keep. */
const TRACE_ARGUMENT_ROOM = 400;

/**
 * Runs one instruction: the model reads and edits a server-side copy of the score through the
 * score tools until it replies, asks a question, or hits the step cap. The editor's own score
 * stays authoritative; it replays `commands` against its current revision.
 */
export async function runAssistant(
  model: ModelPort,
  request: AssistantRequest,
  turnId: string = crypto.randomUUID().slice(0, 8),
): Promise<AssistantResult> {
  let session: Session = createSession(request.score);
  const tools = createScoreToolGateway(
    () => session,
    (next) => {
      session = next;
    },
  );
  const commands: Command[] = [];
  let toolWrites = 0;
  // Tools that write (a transcription) commit through the same gateway as score_edit.
  const music = createMusicTools(request.take ?? null, {
    getScore: () => session.score,
    commit: (operation) => {
      const command = {
        requestId: `${turnId}-tool-${++toolWrites}`,
        expectedRevision: session.score.revision,
        operation,
      };
      const result = tools("score_edit", command);
      if (result.ok) commands.push(commandSchema.parse(command));
      return result;
    },
  });
  const toolList = [...assistantTools, ...musicToolSpecs(Boolean(request.take))];
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const trace: TraceEntry[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historyMessages(request),
    userMessage(request),
  ];
  const finish = (reply: string, question: AssistantResult["question"], steps: number): AssistantResult => ({
    reply,
    question,
    commands,
    changes: commands.length ? summarizeChange(request.score, session.score) : [],
    steps,
    usage,
    trace,
  });

  for (let step = 1; step <= MAX_TOOL_STEPS; step++) {
    const reply = await model.complete(messages, toolList);
    usage.inputTokens += reply.usage?.inputTokens ?? 0;
    usage.outputTokens += reply.usage?.outputTokens ?? 0;
    usage.cachedInputTokens! += reply.usage?.cachedInputTokens ?? 0;
    messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
    if (!reply.toolCalls.length) return finish(reply.content?.trim() || "Done.", null, step);
    for (const call of reply.toolCalls) {
      const entry = { tool: call.name, arguments: call.arguments.slice(0, TRACE_ARGUMENT_ROOM), ok: true };
      trace.push(entry);
      if (call.name === ASK_TOOL) {
        const ask = askSchema.safeParse(parseArguments(call));
        if (ask.success) return finish(ask.data.question, { text: ask.data.question, choices: ask.data.choices }, step);
      }
      const result = isMusicTool(call.name)
        ? music(call.name, parseArguments(call))
        : runTool(call, tools, commands, turnId);
      if (!result.ok) Object.assign(entry, { ok: false, error: "error" in result ? result.error : undefined });
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
    }
  }
  return finish(`I stopped after ${MAX_TOOL_STEPS} steps; here is what I changed so far.`, null, MAX_TOOL_STEPS);
}

/** Executes one score tool, keeping `commands` in step with what the session actually holds. */
function runTool(
  call: ToolCall,
  tools: ReturnType<typeof createScoreToolGateway>,
  commands: Command[],
  turnId: string,
) {
  const args = parseArguments(call);
  if (args === undefined) return { ok: false, error: "Arguments were not valid JSON." };
  if (call.name === "score_edit") {
    const command = commandSchema.safeParse(namespaced(args, turnId));
    if (!command.success) return tools(call.name, args);
    const result = tools(call.name, command.data);
    if (result.ok) commands.push(command.data);
    return result;
  }
  if (call.name !== "score_get_context" && call.name !== "score_undo") {
    return { ok: false, error: `Unknown tool ${call.name}.` };
  }
  const result = tools(call.name, args);
  if (call.name === "score_undo" && result.ok && result.changed) commands.pop();
  return result;
}

function parseArguments(call: ToolCall): unknown {
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

function historyMessages(request: AssistantRequest): ChatMessage[] {
  return request.history.flatMap((turn): ChatMessage[] => [
    { role: "user", content: turn.instruction },
    { role: "assistant", content: turn.reply, toolCalls: [] },
  ]);
}

/** A take's words are the request itself: the agent is told so, not left to infer it. */
const TAKE_INTRO = "The musician recorded this take. What they said is their request; carry it out.";

function userMessage(request: AssistantRequest): ChatMessage {
  const take = request.take ? `\n\n${TAKE_INTRO}\n${describeTake(request.take)}` : "";
  const selection = request.selectedIds.length ? `\n\n[Selected IDs: ${request.selectedIds.join(", ")}]` : "";
  return { role: "user", content: `${request.instruction}${take}${selection}`.trim() };
}
