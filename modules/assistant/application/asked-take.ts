import type { SpeechTurn } from "@/modules/voice";

/**
 * The last recorded take, kept so that typed words can go with it: an answer to the agent's
 * question about it, or a follow-up once it was written ("try again", "only bar 2", "keep the
 * rhythm"). `written` once the agent acted on it rather than asking.
 */
export type AskedTake = { wav: Uint8Array; speech?: SpeechTurn[]; written?: boolean };

/**
 * Which take the musician's next typed words go with, after a turn that sent `sent` (a take, or
 * null for words alone): the take stays with the words that follow it, until another take or
 * attached files replace it (`closed`). A failed turn changes nothing. Once the agent answers
 * without a question, the take counts as written.
 */
export function askedAfter(
  open: AskedTake | null,
  sent: AskedTake | null,
  result: { question?: unknown } | null,
  closed = false,
): AskedTake | null {
  if (!result) return open;
  if (closed) return null;
  const take = sent ?? open;
  if (!take) return null;
  return result.question ? take : { ...take, written: true };
}

/**
 * Typed words' request with their take's words (so the take is not recognized again), and
 * whether it was already written, so the agent hears it again only for what the words ask.
 */
export function withHeardWords<P extends object>(
  payload: P,
  take: AskedTake,
): P & { speech?: SpeechTurn[]; takeWritten?: true } {
  return {
    ...payload,
    ...(take.speech ? { speech: take.speech } : {}),
    ...(take.written ? { takeWritten: true as const } : {}),
  };
}
