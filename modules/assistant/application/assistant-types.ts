import type { PageImages } from "@/modules/page";
import type { Command, InstrumentId, Score } from "@/modules/score";
import type { TakePart, VoiceTake } from "@/modules/voice";
import type { PlanStep } from "./agent-state";
import type { BandNote } from "./band-board";
import type { BandReport, BandRound } from "./band-tools";
import type { Attachment } from "./attachments";
import type { DraftEvent } from "./score-block-writer";
import type { EditsEvent } from "./edit-feed";
import type { ModelPort, TokenUsage } from "./model-port";

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
  /** The take was recorded and written last turn; typed words now follow up on it. */
  takeWritten?: boolean;
  /** What the agent wrote down about this song in earlier turns. */
  songNotes?: string;
  /** What the agent has learned about this musician, across songs. */
  memory?: string[];
  /** Band Mode: music several parts play goes to a band the agent puts together, one musician per part. */
  band?: { on: boolean };
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
  /** The agent's plan, as it last showed it, when it made one. */
  plan?: PlanStep[];
  /** The song's notes, when the agent rewrote them: the browser keeps them for the next turn. */
  songNotes?: string;
  /** What it knows about the musician, when that changed: the browser keeps it. */
  memory?: string[];
  /** What each musician of the band played, when the band did. */
  band?: BandReport[];
  /** What the musicians (and the bandleader) said to each other, when the band rehearsed. */
  bandNotes?: BandNote[];
  /** What the band's listening heard after each pass, for measuring the rehearsals. */
  bandRounds?: BandRound[];
};

/** `ms` is how long the tool itself ran. */
export type TraceEntry = { tool: string; arguments: string; ok: boolean; error?: string; ms?: number };

/** What the assistant is doing right now, for a live progress line (never the model's text). */
export type ProgressEvent =
  | { stage: "hearing" }
  /** The take was heard: what was said and sung, in order. Sent before the agent starts. */
  | { stage: "heard"; parts: TakePart[] }
  | { stage: "thinking" }
  /** A piece of the model's reasoning summary, as it streams: shown as its thinking. */
  | { stage: "thought"; text: string }
  /** The agent's plan, whenever it shows or updates it. */
  | { stage: "plan"; steps: PlanStep[] }
  /**
   * A musician of the band: waiting its turn, playing (with its thinking as it streams), or done;
   * `round` is 0 the first time through, then the rehearsal round it is in.
   */
  | {
      stage: "musician";
      part: string;
      instrument: InstrumentId;
      name: string;
      state: "waiting" | "playing" | "done";
      round?: number;
      thought?: string;
      report?: string;
    }
  /** A musician (or the bandleader) said something to a bandmate, or to the whole band ("band"). */
  | { stage: "band_note"; from: string; to: string; note: string }
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
  /** The model the band's musicians think with (Band Mode): a level below the bandleader's. Default: the same. */
  musicians?: ModelPort;
  /** Evaluations only: the instructions to run with instead of `SYSTEM_PROMPT` (e.g. with one rule left out). */
  systemPrompt?: string;
};
