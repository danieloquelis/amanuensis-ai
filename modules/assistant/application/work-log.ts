import type { InstrumentId } from "@/modules/score";
import type { PlanStep } from "./agent-state";
import type { ProgressEvent } from "./run-assistant";

/** What a turn did, in order: its thinking (the model's reasoning summary) and the steps it took. */
export type WorkEntry = { kind: "thought"; text: string } | { kind: "step"; tool: string };

/** A musician of the band in a turn: its state, the thought it is on, and its note to the bandleader. */
export type BandSeat = {
  part: string;
  instrument: InstrumentId;
  name: string;
  state: "waiting" | "playing" | "done";
  thought?: string;
  report?: string;
};

/** A turn's record of its work: the log, its plan when it made one, and its band in Band Mode. */
export type TurnWork = { log?: WorkEntry[]; plan?: PlanStep[]; band?: BandSeat[] };

/** The thinking a turn keeps (characters): enough to see why, not the whole stream. */
const KEPT_THOUGHT = 4000;

/**
 * A turn's work after one progress event: a piece of thinking joins the thought being written,
 * a tool starts a new step, a plan replaces the last one. Other events leave it as it was.
 */
export function withProgress(work: TurnWork, event: ProgressEvent): TurnWork {
  const log = work.log ?? [];
  if (event.stage === "plan") return { ...work, plan: event.steps };
  if (event.stage === "musician") return { ...work, band: withMusician(work.band ?? [], event) };
  if (event.stage === "tool") return { ...work, log: [...log, { kind: "step", tool: event.tool }] };
  if (event.stage !== "thought") return work;
  const last = log.at(-1);
  if (last?.kind === "thought")
    return { ...work, log: [...log.slice(0, -1), { ...last, text: last.text + event.text }] };
  return { ...work, log: [...log, { kind: "thought", text: event.text }] };
}

/** The log as kept with the chat: blank thinking dropped, the thinking cut to what is worth keeping. */
export function logToKeep(log: WorkEntry[] = []): WorkEntry[] {
  let room = KEPT_THOUGHT;
  return log.flatMap((entry): WorkEntry[] => {
    if (entry.kind === "step") return [entry];
    const text = entry.text.trim().slice(0, Math.max(0, room));
    room -= text.length;
    return text ? [{ kind: "thought", text }] : [];
  });
}

/** The agent's tools as a musician would say them, for its thinking shown in the chat. */
const TOOL_WORDS: Record<string, string> = {
  score_get_context: "the score",
  score_edit: "the edit",
  score_write: "the new bars",
  score_undo: "undo",
  music_infer_key: "finding the key",
  music_infer_tempo: "finding the tempo",
  music_suggest_chords: "suggesting chords",
  voice_hear_notes: "listening to the notes",
  voice_transcribe_melody: "the transcription",
  voice_check: "checking against your take",
  music_read_source: "reading the page",
  page_check: "checking against the page",
  assistant_ask: "a question",
  assistant_plan: "the plan",
  song_notes_write: "the song notes",
  musician_remember: "what I remember about you",
  musician_forget: "what I remember about you",
};

/**
 * The model's thinking in the musician's words: tool names, take parts ("sung-1") and other
 * internal names it reasons with become plain words.
 */
export function readableThought(text: string): string {
  return text
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (name) => TOOL_WORDS[name] ?? name.replace(/_/g, " "))
    .replace(/\b(?:the )?sung-1(?: (?:span|audio))?\b/g, "your singing")
    .replace(/\b(?:the )?sung-(\d+)(?: (?:span|audio))?\b/g, "sung part $1")
    .replace(/\b(?:the )?voice-\d+(?: (?:span|audio|stretch))?\b/g, "the other voice")
    .replace(/\bspans?\b/g, (word) => (word === "span" ? "part" : "parts"));
}

/** The band after a musician's event: its seat added or updated; its thinking joins the thought it is on. */
function withMusician(band: BandSeat[], event: Extract<ProgressEvent, { stage: "musician" }>): BandSeat[] {
  const { part, instrument, name, state, thought, report } = event;
  const seat = band.find((s) => s.part === part);
  if (!seat) return [...band, { part, instrument, name, state, ...(report ? { report } : {}) }];
  // A musician sent back plays again: its thought starts over.
  const again = state === "playing" && seat.state === "done";
  const next: BandSeat = {
    ...seat,
    state,
    thought: thought ? (again ? "" : (seat.thought ?? "")) + thought : again ? undefined : seat.thought,
    ...(report ? { report } : {}),
  };
  return band.map((s) => (s.part === part ? next : s));
}
