import type { PageImages } from "@/modules/page";
import { summarizeChange, type Command, type Operation, type Score } from "@/modules/score";
import type { TakePart, VoiceTake } from "@/modules/voice";
import { ASK_TOOL, askSchema, assistantTools } from "./assistant-tools";
import type { Attachment } from "./attachments";
import { createMusicTools, isMusicTool, musicToolSpecs } from "./music-tools";
import type { ChatMessage, ContentPart, ModelPort, TokenUsage, ToolCall } from "./model-port";
import { refuseHeardBarEdit, writtenLines } from "./heard-bars-guard";
import { parseArguments, runScoreTool } from "./score-tool-call";
import { createScoreToolGateway } from "./score-tool-gateway";
import { createEditFeed, type EditsEvent } from "./edit-feed";
import { createScoreBlockWriter, type DraftEvent } from "./score-block-writer";
import { withoutScoreBlocks } from "./score-blocks";
import { createSourceTools, isSourceTool, sourceToolSpecs } from "./source-tools";
import { historyMessages, scoreContext, userMessage } from "./opening-messages";
import { SYSTEM_PROMPT } from "./system-prompt";
import { createTurnEdits } from "./turn-edits";

const TRANSCRIBE_TOOL = "voice_transcribe_melody";
/** Hard cap on model round trips per instruction. */
export const MAX_TOOL_STEPS = 12;
/** Reading attached music takes more: read, set up, write a few bars at a time, check, fix. */
export const MAX_SOURCE_STEPS = 24;

export type AssistantTurn = { instruction: string; reply: string };

export type AssistantRequest = {
  instruction: string;
  score: Score;
  selectedIds: string[];
  /** What the musician calls the selection ("Bars 3–6"), so their words can refer to it. */
  selectionName?: string;
  /** Recent turns, oldest first, so follow-ups ("make it softer") have context. */
  history: AssistantTurn[];
  /** A recorded take: what was said (the instruction) and where singing happened. */
  take?: VoiceTake;
  /** Files sent with the request: pictures or PDFs of sheet music, or music written as text. */
  attachments?: Attachment[];
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
  /** How long each model call took (ms), in order: where the turn's time went. */
  thinkingMs: number[];
};

/** `ms` is how long the tool itself ran. */
export type TraceEntry = { tool: string; arguments: string; ok: boolean; error?: string; ms?: number };

/** What the assistant is doing right now, for a live progress line (never the model's text). */
export type ProgressEvent =
  | { stage: "hearing" }
  /** The take was heard: what was said and sung, in order. Sent before the agent starts. */
  | { stage: "heard"; parts: TakePart[] }
  | { stage: "thinking" }
  | { stage: "tool"; tool: string }
  /** The turn's edits so far changed: the editor can show them before the turn ends. */
  | EditsEvent
  /** Bars being written in a <score> block, before it closes. */
  | DraftEvent;
export type ProgressListener = (event: ProgressEvent) => void;

export type TurnServices = {
  /** Reads noteheads on attached pictures; without it they are read by eye. */
  pageImages?: PageImages | null;
  /** Stops the turn: the model call in flight is cancelled and no further step starts. */
  signal?: AbortSignal;
  /** Evaluations only: the instructions to run with instead of `SYSTEM_PROMPT` (e.g. with one rule left out). */
  systemPrompt?: string;
};
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
  onProgress: ProgressListener = () => {},
  { pageImages = null, signal, systemPrompt = SYSTEM_PROMPT }: TurnServices = {},
): Promise<AssistantResult> {
  // The working copy and the commands the editor replays, kept by one owner.
  const edits = createTurnEdits(request.score);
  const tools = createScoreToolGateway(edits);
  const feed = createEditFeed();
  let toolWrites = 0;
  // Bars a transcription wrote this turn: the agent may not rewrite their notes (see the guard).
  const heard = new Set<string>();
  let runningTool = "";
  // Tools that write (a transcription, a setup from a reading) commit through the same gateway as score_edit.
  const commit = (operation: Operation) => {
    const command = {
      requestId: `${turnId}-tool-${++toolWrites}`,
      expectedRevision: edits.score().revision,
      operation,
    };
    const result = tools("score_edit", command);
    if (result.ok && runningTool === TRANSCRIBE_TOOL)
      writtenLines(edits.score(), operation).forEach((key) => heard.add(key));
    return result;
  };
  const music = createMusicTools(request.take ?? null, { getScore: edits.score, commit });
  const attachments = request.attachments ?? [];
  // Pictures a tool shows the model (labelled pages) go in a user message after the tool results.
  let shown: ContentPart[] = [];
  const sources = createSourceTools(attachments, pageImages, edits.score, (parts) => shown.push(...parts), commit);
  const toolList = [
    ...assistantTools,
    ...musicToolSpecs(Boolean(request.take)),
    ...sourceToolSpecs(attachments.length > 0),
  ];
  const maxSteps = attachments.length ? MAX_SOURCE_STEPS : MAX_TOOL_STEPS;
  const scoreTool = (call: ToolCall) =>
    runScoreTool(call, tools, turnId, edits.score, (operation, asked) =>
      refuseHeardBarEdit(edits.score(), operation, heard, asked, musicianWords(request)),
    );
  const sendEdits = () => {
    const change = feed.update(edits.commands);
    if (change) onProgress(change);
  };
  // Bars written in <score> blocks go through score_write, under the request ID their draft used.
  const blocks = createScoreBlockWriter(turnId, onProgress, (requestId, text, pitches) => {
    const args = JSON.stringify({ requestId, expectedRevision: edits.score().revision, text, pitches });
    const call = { id: requestId, name: "score_write", arguments: args };
    const result = sources.refuseUnread(call.name) ?? scoreTool(call);
    trace.push({ tool: "score_block", arguments: args.slice(0, TRACE_ARGUMENT_ROOM), ok: result.ok });
    return result;
  });
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
  const trace: TraceEntry[] = [];
  const thinkingMs: number[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...historyMessages(request),
    userMessage(request, scoreContext(tools, request)),
  ];
  const finish = (reply: string, question: AssistantResult["question"], steps: number): AssistantResult => {
    // A server-side fault, caught here rather than as a failed replay in the musician's editor.
    edits.verify();
    return {
      reply,
      question,
      commands: [...edits.commands],
      changes: edits.commands.length ? summarizeChange(request.score, edits.score()) : [],
      steps,
      usage,
      trace,
      thinkingMs,
    };
  };

  for (let step = 1; step <= maxSteps; step++) {
    if (signal?.aborted) return finish("Stopped.", null, step - 1);
    onProgress({ stage: "thinking" });
    const asked = Date.now();
    blocks.start();
    const reply = await model.complete(messages, toolList, { signal, onText: blocks.hear });
    thinkingMs.push(Date.now() - asked);
    usage.inputTokens += reply.usage?.inputTokens ?? 0;
    usage.outputTokens += reply.usage?.outputTokens ?? 0;
    usage.cachedInputTokens! += reply.usage?.cachedInputTokens ?? 0;
    messages.push({ role: "assistant", content: reply.content, toolCalls: reply.toolCalls });
    const written = blocks.commit(reply.content);
    sendEdits();
    // A reply with no tool calls ends the turn, unless a block it wrote was refused: then it may fix it.
    if (!reply.toolCalls.length && (!written || written.ok)) {
      return finish(withoutScoreBlocks(reply.content ?? "") || "Done.", null, step);
    }
    for (const call of reply.toolCalls) {
      onProgress({ stage: "tool", tool: call.name });
      const entry: TraceEntry = { tool: call.name, arguments: call.arguments.slice(0, TRACE_ARGUMENT_ROOM), ok: true };
      trace.push(entry);
      if (call.name === ASK_TOOL) {
        const ask = askSchema.safeParse(parseArguments(call));
        if (ask.success) return finish(ask.data.question, { text: ask.data.question, choices: ask.data.choices }, step);
      }
      const started = Date.now();
      runningTool = call.name;
      const result =
        sources.refuseUnread(call.name) ??
        (isSourceTool(call.name)
          ? await sources.run(call.name, parseArguments(call))
          : isMusicTool(call.name)
            ? music(call.name, parseArguments(call))
            : scoreTool(call));
      entry.ms = Date.now() - started;
      if (!result.ok) Object.assign(entry, { ok: false, error: "error" in result ? result.error : undefined });
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
      sendEdits();
    }
    // What the tools showed (labelled pages) and how the blocks were written follow the tool results.
    const after: ContentPart[] = [...(written ? [{ type: "text" as const, text: written.report }] : []), ...shown];
    if (after.length) messages.push({ role: "user", content: after });
    shown = [];
  }
  return finish(
    `I ran out of steps before finishing; what I changed so far is applied (Undo takes it back).`,
    null,
    maxSteps,
  );
}

/** Everything the musician said or typed this turn, for checking the agent's quotes of it. */
const musicianWords = (request: AssistantRequest) =>
  [request.instruction, ...(request.take?.speech.map((turn) => turn.text) ?? [])].join(" ");
