import { groovesFor, SCORE_TEXT_GUIDE, type InstrumentId, type Score } from "@/modules/score";
import { assistantTools } from "./assistant-tools";
import type { ProgressListener } from "./assistant-types";
import type { ChatMessage, ModelPort, TokenUsage, ToolCall } from "./model-port";
import { craftCard } from "./musicians";
import { refuseOutsidePart } from "./part-scope";
import { runScoreTool } from "./score-tool-call";
import type { createScoreToolGateway } from "./score-tool-gateway";
import { withoutScoreBlocks } from "./score-blocks";

/** A musician's round trips to the model for its part: read, write, look again, fix, report. */
const MUSICIAN_STEPS = 6;
const MUSICIAN_TOOLS = assistantTools.filter((tool) =>
  ["score_get_context", "score_edit", "score_write"].includes(tool.name),
);

const MUSICIAN_PROMPT = `You are one musician in the band of Amanuensis, a music notation editor, writing your own part of an arrangement the bandleader asked for. The others play too: those before you have written their parts (read them in the score and their notes); those after you will listen to yours.

How to work:
- Write only your part, in its staves (score_write lines name them, "bar 3 bass: …"; score_edit takes voiceId or staffId). Everything else is the bandleader's: chords, marks, key, meter, tempo, other parts.
- Your part may already hold music (a lead sheet's melody on the piano): keep it unless your brief says to replace it, and put yours beside it, on a second staff (setStaffCount, then "bar N piano.2: …") or a second voice ("bar N piano v2: …").
- Fit the band: follow the chords in the score, the feel in the brief, and what the others play (lock with the drums' kick, stay out of the melody's register, leave room where another part speaks).
- Write your whole part in one score_write call (every bar of the passage, all your staves), then look at the score once and fix what is off. Don't write a few bars at a time.
- Then reply to the bandleader in one or two short sentences: what you played and why, as a musician would say it.

${SCORE_TEXT_GUIDE}`;

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

/** One part to play: its handle, instrument, the musician's name and the bandleader's brief. */
export type MusicianJob = { part: string; instrument: InstrumentId; name: string; brief: string };

/**
 * One musician plays its part: a short agent loop with its own instructions (its instrument's
 * craft), the score so far and the reports of those who played before, writing only its own part.
 * Returns its report to the bandleader.
 */
export async function runMusician(
  context: BandContext,
  job: MusicianJob,
  feel: string,
  before: string[],
): Promise<{ report: string; ok: boolean }> {
  const { model, tools, score, turnId, signal, onProgress, onEdits } = context;
  const progress = (extra: { thought?: string; report?: string; state: "playing" | "done" }) =>
    onProgress({ stage: "musician", part: job.part, instrument: job.instrument, name: job.name, ...extra });
  const scoreNow = () => {
    const result = tools("score_get_context", { selectedIds: [] }) as { score?: string };
    return result.score ?? "";
  };
  const messages: ChatMessage[] = [
    { role: "system", content: `${MUSICIAN_PROMPT}\n\n${craftCard(job.instrument, job.name)}` },
    {
      role: "user",
      content: [
        `The band's feel: ${feel}`,
        `Your part (${job.part}): ${job.brief}`,
        before.length ? `What the others played:\n${before.map((line) => `- ${line}`).join("\n")}` : "You play first.",
        ...(job.instrument === "drums" ? [`Grooves for this meter: ${grooves(score())}.`] : []),
        ...(context.memory?.length
          ? [`What you know about the musician and their band:\n${list(context.memory)}`]
          : []),
        `[Score context, as score_get_context returns it]\n${scoreNow()}`,
      ].join("\n\n"),
    },
  ];
  const refuse = (operation: Parameters<typeof refuseOutsidePart>[1]) =>
    refuseOutsidePart(score(), operation, job.part);
  progress({ state: "playing" });
  for (let step = 1; step <= MUSICIAN_STEPS; step++) {
    if (signal?.aborted) break;
    const asked = Date.now();
    const reply = await model.complete(messages, MUSICIAN_TOOLS, {
      signal,
      onThought: (thought) => progress({ state: "playing", thought }),
      cacheKey: `${turnId}-${job.part}`,
    });
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
      // A musician never clears the chords or sections its lines leave out: they are the bandleader's.
      const own = call.name === "score_write" ? { ...call, arguments: withHarmonyKept(call.arguments) } : call;
      const result = runScoreTool(own, tools, `${turnId}-${job.part}`, score, refuse);
      messages.push({ role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
      context.onCall?.({
        tool: `${job.part}: ${call.name}`,
        arguments: call.arguments,
        ok: result.ok,
        ...(result.ok ? {} : { error: result.error }),
      });
      onEdits();
    }
  }
  const report = "I ran out of time before finishing my part.";
  progress({ state: "done", report });
  return { report, ok: false };
}

/** A score_write call's arguments with keepHarmony set; unreadable arguments are left for the tool to report. */
function withHarmonyKept(json: string): string {
  try {
    return JSON.stringify({ ...JSON.parse(json || "{}"), keepHarmony: true });
  } catch {
    return json;
  }
}

const list = (lines: string[]) => lines.map((line) => `- ${line}`).join("\n");
/** The grooves putGroove has for the song's meter, for the drummer to start from. */
const grooves = (score: Score) => groovesFor(score.measures[0].meter).join(", ") || "none: write it by hand";
