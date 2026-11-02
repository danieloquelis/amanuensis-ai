import { z } from "zod";
import { INSTRUMENT_IDS } from "@/modules/score";
import type { TakePart } from "@/modules/voice";
import type { AttachmentKind } from "./attachments";
import type { ProgressEvent } from "./run-assistant";
import { logToKeep, type TurnWork } from "./work-log";

/** Enough to scroll back through a long session without growing local storage without bound. */
export const SAVED_TURN_LIMIT = 60;

export type Turn = {
  id: string;
  instruction: string;
  status: "working" | "done" | "failed";
  reply?: string;
  question?: { text: string; choices: string[] };
  changes?: string[];
  /** Score revision right after this turn's edits; Undo is offered while it is still current. */
  revision?: number;
  /** What the assistant is doing right now, while the turn is working. */
  activity?: ProgressEvent;
  /** Whether the turn came from a recorded take. */
  spoken?: boolean;
  /** For a take: what was said and sung, in order, as soon as it is known. */
  heard?: TakePart[];
  /** The selection the request was about ("Bars 3–6"), shown with it in the chat. */
  context?: string;
  /** Files sent with the request, by name; the files themselves are never kept. */
  attachments?: { name: string; kind: AttachmentKind }[];
  /** How long the answer took, from sending to the reply (or the failure). */
  seconds?: number;
} & TurnWork;

const SECONDS_PER_MINUTE = 60;

/** "14 s", or "1 min 20 s" for a long one. */
export function answerTime(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  if (whole < SECONDS_PER_MINUTE) return `${whole} s`;
  const rest = whole % SECONDS_PER_MINUTE;
  return `${Math.floor(whole / SECONDS_PER_MINUTE)} min${rest ? ` ${rest} s` : ""}`;
}

/** Port for keeping the conversation with the current song. Implementations may throw. */
export interface ChatRepository {
  load(): Turn[];
  save(turns: Turn[]): void;
  /** What the agent wrote down about this song ("" when nothing yet). */
  loadNotes(): string;
  saveNotes(text: string): void;
}

/** Port for what the agent has learned about the musician, across songs. Implementations may throw. */
export interface MusicianMemory {
  load(): string[];
  save(facts: string[]): void;
}

/** Port for the conversations on this device, one per workspace. */
export interface WorkspaceChats {
  /** The conversation with one workspace. */
  for(workspaceId: string): ChatRepository;
  /** Moves the pre-workspace conversation to the workspace its draft became; later calls do nothing. */
  adoptLegacy(workspaceId: string): void;
  /** Forgets one workspace's conversation. */
  remove(workspaceId: string): void;
}

const takePartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("said"), text: z.string() }),
  z.object({ kind: z.literal("sang"), seconds: z.number() }),
]);

/**
 * A turn as it is kept. Unknown keys are dropped: `revision` and `activity` describe this
 * session only, and an Undo offered after a reload would have no history to undo.
 */
const savedTurnSchema = z.object({
  id: z.string(),
  instruction: z.string(),
  status: z.enum(["done", "failed"]),
  reply: z.string().optional(),
  question: z.object({ text: z.string(), choices: z.array(z.string()) }).optional(),
  changes: z.array(z.string()).optional(),
  spoken: z.boolean().optional(),
  heard: z.array(takePartSchema).optional(),
  context: z.string().optional(),
  attachments: z.array(z.object({ name: z.string(), kind: z.enum(["image", "pdf", "text"]) })).optional(),
  seconds: z.number().nonnegative().optional(),
  plan: z.array(z.object({ text: z.string(), done: z.boolean() })).optional(),
  band: z
    .array(
      z.object({
        part: z.string(),
        instrument: z.enum(INSTRUMENT_IDS),
        name: z.string(),
        state: z.enum(["waiting", "playing", "done"]),
        round: z.number().int().nonnegative().optional(),
        report: z.string().optional(),
      }),
    )
    .optional(),
  talk: z.array(z.object({ from: z.string(), to: z.string(), note: z.string() })).optional(),
  log: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("thought"), text: z.string() }),
        z.object({ kind: z.literal("step"), tool: z.string() }),
      ]),
    )
    .optional(),
});

/** The finished turns worth keeping, newest last; one still working is left out. */
export function turnsToSave(turns: Turn[]): Turn[] {
  return turns
    .filter((turn) => turn.status !== "working")
    .slice(-SAVED_TURN_LIMIT)
    .map((turn) => (turn.log ? { ...turn, log: logToKeep(turn.log) } : turn));
}

/** Saved turns read back; anything unreadable is skipped rather than failing the whole chat. */
export function restoreTurns(saved: unknown): Turn[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((item) => {
    const parsed = savedTurnSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
