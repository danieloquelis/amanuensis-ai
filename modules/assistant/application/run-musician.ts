import { scoreText, type Score } from "@/modules/score";
import { assistantTools } from "./assistant-tools";
import type { ProgressListener } from "./assistant-types";
import type { ChatMessage, ModelPort, TokenUsage, ToolCall } from "./model-port";
import {
  BAND_NOTE,
  bandNoteSpec,
  musicianBrief,
  musicianSystem,
  noteSchema,
  type BandPlan,
  type MusicianJob,
  type MusicianRound,
} from "./musician-brief";
import { BAND_MOTIF, bandMotifSpec, playMotif } from "./musician-motif";
import { refuseOutsidePart } from "./part-scope";
import { refuseTuneChange } from "./tune-line";
import { parseArguments, runScoreTool } from "./score-tool-call";
import type { createScoreToolGateway } from "./score-tool-gateway";
import { toolError } from "./score-tool-gateway";
import { withoutScoreBlocks } from "./score-blocks";

export type { BandPlan, MusicianJob, MusicianRound } from "./musician-brief";

/** A musician's round trips to the model: read, place the material, write, look again, fix, talk, report. */
const FIRST_STEPS = 3;
/** In a rehearsal there is less to do: listen, change some bars, say so. */
const REHEARSAL_STEPS = 2;
const MUSICIAN_TOOLS = [
  ...assistantTools.filter((tool) => ["score_get_context", "score_edit", "score_write"].includes(tool.name)),
  bandNoteSpec,
];

type Gateway = ReturnType<typeof createScoreToolGateway>;

/** What a musician needs from the turn: the model, the score tools, and where to report progress. */
export type BandContext = {
  model: ModelPort;
  tools: Gateway;
  score: () => Score;
  turnId: string;
  signal?: AbortSignal;
  onProgress: ProgressListener;
  /** The edits changed: the editor can show them now. */
  onEdits: () => void;
  /** Hears each model call a musician makes (tokens and time), so the turn's cost counts the whole band. */
  onModelCall?: (usage: TokenUsage | undefined, ms: number) => void;
  /** What the agent knows about the musician and their band; the musicians follow it too. */
  memory?: string[];
  /** Hears each tool call a musician makes, for the turn's trace. */
  onCall?: (entry: { tool: string; arguments: string; ok: boolean; error?: string }) => void;
};

/** Where a musician's notes to its bandmates go, and who it may write to. */
export type BandRoom = {
  bandmates: string[];
  /** Delivers a note; returns why it could not be, or null. */
  say: (from: MusicianJob, to: string, note: string) => string | null;
};

/**
 * One musician plays its part, once through or in a rehearsal round: a short agent loop with its
 * own instructions (its instrument's craft), the score as it stands and what the band said,
 * writing only its own part and talking to its bandmates. Returns its report to the bandleader.
 */
export async function runMusician(
  context: BandContext,
  job: MusicianJob,
  plan: BandPlan,
  round: MusicianRound,
  room: BandRoom,
): Promise<{ report: string; ok: boolean }> {
  const { model, tools, score, turnId, signal, onProgress, onEdits } = context;
  const pass = round.kind === "first" ? 0 : round.round;
  const progress = (extra: { thought?: string; report?: string; state: "playing" | "done" }) =>
    onProgress({
      stage: "musician",
      part: job.part,
      instrument: job.instrument,
      name: job.name,
      round: pass,
      ...extra,
    });
  const scoreNow = (tools("score_get_context", { selectedIds: [] }) as { score?: string }).score ?? "";
  const brief = musicianBrief(job, plan, round, {
    score: score(),
    scoreText: scoreNow,
    bandmates: room.bandmates.filter((name) => name !== job.name),
    memory: context.memory,
  });
  const messages: ChatMessage[] = [
    { role: "system", content: musicianSystem(job) },
    { role: "user", content: brief },
  ];
  // Only its own part, and the tune where it carries it kept as planned.
  const refuse = (operation: Parameters<typeof refuseOutsidePart>[1]) =>
    refuseOutsidePart(score(), operation, job.part) ?? refuseTuneChange(score(), operation, job.kept ?? []);
  const cacheKey = `${turnId}-${job.part}-${pass}`;
  // A write's reply shows the musician its part as it now stands: it checks it there, without reading the score again.
  const written = (result: Result): Result =>
    result.ok && "changes" in result ? { ...result, yourPart: scoreText(score(), { parts: [job.part] }) } : result;
  progress({ state: "playing" });
  for (let step = 1; step <= (pass ? REHEARSAL_STEPS : FIRST_STEPS); step++) {
    if (signal?.aborted) break;
    const asked = Date.now();
    const reply = await model
      .complete(messages, plan.materials.length ? [...MUSICIAN_TOOLS, bandMotifSpec] : MUSICIAN_TOOLS, {
        signal,
        onThought: (thought) => progress({ state: "playing", thought }),
        cacheKey,
        // A rehearsal reacts to what the band sounds like: quick, not deep.
        ...(pass ? { effort: "low" } : {}),
      })
      // Stopped by the band's clock (or the musician stopping the turn): what it wrote stays.
      .catch((error: unknown) => {
        if (signal?.aborted) return null;
        throw error;
      });
    if (!reply) break;
    context.onModelCall?.(reply.usage, Date.now() - asked);
    messages.push({
      role: "assistant",
      content: reply.content,
      toolCalls: reply.toolCalls,
      reasoning: reply.reasoning,
    });
    if (!reply.toolCalls.length) {
      const report = withoutScoreBlocks(reply.content ?? "").trim() || "Played my part.";
      progress({ state: "done", report });
      return { report, ok: true };
    }
    for (const call of reply.toolCalls as ToolCall[]) {
      const edit = call.name === BAND_MOTIF ? playMotif(call, score(), plan.materials, job.part) : call;
      const result =
        call.name === BAND_NOTE
          ? note(call, job, room)
          : "error" in edit
            ? edit
            : written(runScoreTool(own(edit, score), tools, cacheKey, score, refuse));
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
      context.onCall?.({
        tool: `${job.part}: ${call.name}`,
        arguments: call.arguments,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
      });
      if (call.name !== BAND_NOTE) onEdits();
    }
  }
  const report = signal?.aborted
    ? "Time was up: I kept what I had written."
    : "I ran out of time before finishing my part.";
  progress({ state: "done", report });
  return { report, ok: false };
}

type Result = { ok: true; [key: string]: unknown } | { ok: false; error: string };

function note(call: ToolCall, job: MusicianJob, room: BandRoom): Result {
  try {
    const { to, note: text } = noteSchema.parse(parseArguments(call));
    const refused = room.say(job, to, text);
    return refused ? { ok: false, error: refused } : { ok: true, sent: `to ${to}` };
  } catch (error) {
    return { ok: false, error: toolError(error) };
  }
}

/**
 * A musician's edit, made its own: it writes against the score as it is now (the others play
 * their own parts meanwhile), and a write never clears the chords or sections its lines leave
 * out, which are the bandleader's.
 */
function own(call: ToolCall, score: () => Score): ToolCall {
  if (call.name !== "score_write" && call.name !== "score_edit") return call;
  try {
    const args = JSON.parse(call.arguments || "{}");
    const current = { ...args, expectedRevision: score().revision };
    if (args.operation) current.operation = namedTarget(args.operation);
    return {
      ...call,
      arguments: JSON.stringify(call.name === "score_write" ? { ...current, keepHarmony: true } : current),
    };
  } catch {
    return call;
  }
}

/** A dynamic or direction put on a note named as `eventId` (a slip musicians make) names it as `targetId`. */
function namedTarget(operation: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(operation.operations)) return { ...operation, operations: operation.operations.map(namedTarget) };
  if (operation.type !== "putAnnotation" || operation.targetId || !operation.eventId) return operation;
  const { eventId, ...rest } = operation;
  return { ...rest, targetId: eventId };
}
