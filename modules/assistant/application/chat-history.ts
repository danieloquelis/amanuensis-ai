import { z } from "zod";
import type { TakePart } from "@/modules/voice";
import type { ProgressEvent } from "./run-assistant";

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
};

/** Port for keeping the conversation with the current song. Implementations may throw. */
export interface ChatRepository {
  load(): Turn[];
  save(turns: Turn[]): void;
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
});

/** The finished turns worth keeping, newest last; one still working is left out. */
export function turnsToSave(turns: Turn[]): Turn[] {
  return turns.filter((turn) => turn.status !== "working").slice(-SAVED_TURN_LIMIT);
}

/** Saved turns read back; anything unreadable is skipped rather than failing the whole chat. */
export function restoreTurns(saved: unknown): Turn[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((item) => {
    const parsed = savedTurnSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
