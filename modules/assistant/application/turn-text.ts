import { takeParts, type TakePart } from "@/modules/voice";
import type { AssistantTurn } from "./assistant-types";
import type { Turn } from "./chat-history";
import type { HeardTake } from "./handle-voice-request";

/** How many earlier turns go with a request, so follow-ups ("make it softer") have context. */
const HISTORY_TURNS = 6;

/** How long a sung stretch is, as the history shows it. */
export const sungLength = (seconds: number) => `${Math.max(1, Math.round(seconds))} s`;

/** A take as text, in order: their words, and "♪ sang 3 s" where they sang (for history). */
export function describeHeard(parts: TakePart[]): string {
  const text = parts.map((part) => (part.kind === "said" ? part.text : `♪ sang ${sungLength(part.seconds)}`));
  return text.join(" ") || "(nothing heard)";
}

/** What a take held, in order: what was said, and where they sang. */
export const heardOf = ({ speech, sung }: HeardTake) => takeParts(speech, sung);

/** Earlier turns name the files they came with (the files themselves are not sent again). */
const attachedNote = (turn: Turn) =>
  turn.attachments?.length ? ` (attached: ${turn.attachments.map((file) => file.name).join(", ")})` : "";

/** The recent answered turns, as the request's history: what each was about, said and answered. */
export function historyOf(turns: Turn[]): AssistantTurn[] {
  return turns
    .filter((turn) => turn.status === "done" && turn.reply)
    .slice(-HISTORY_TURNS)
    .map((turn) => ({
      instruction: `${turn.context ? `[${turn.context}] ` : ""}${turn.instruction}${attachedNote(turn)}`,
      reply: turn.reply!,
    }));
}
