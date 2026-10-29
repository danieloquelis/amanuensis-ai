import type { SpeechTurn } from "@/modules/voice";

/** A recorded take the agent asked a question about, with the words heard in it. */
export type AskedTake = { wav: Uint8Array; speech?: SpeechTurn[] };

/**
 * Which take the musician's next answer goes with, after a turn that sent `sent` (a take, or
 * null for words alone): while the agent's reply is a question, the take it is about stays open
 * (the answer means nothing without its singing); any other reply closes it. A failed turn
 * changes nothing.
 */
export function askedAfter(
  open: AskedTake | null,
  sent: AskedTake | null,
  result: { question?: unknown } | null,
): AskedTake | null {
  if (!result) return open;
  return result.question ? (sent ?? open) : null;
}

/** An answer's request with the take's words, so the take is not sent to be recognized again. */
export function withHeardWords<P extends object>(payload: P, take: AskedTake): P & { speech?: SpeechTurn[] } {
  return take.speech ? { ...payload, speech: take.speech } : payload;
}
