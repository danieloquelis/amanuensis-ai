/** How much of a reply's end is read for a promise of more work. */
const TAIL_CHARACTERS = 240;
/** Words that promise work still to do: the model wrote its plan as its answer instead of acting. */
const PROMISES = /\b(?:I'll|I will|I'm going to|let me|next,? I|now I|then I)\b/i;

/**
 * Whether a reply ends by announcing work it never did ("…I'll verify everything reads
 * correctly."): a reply with no tool call ends the turn, so that check never runs. The turn asks
 * the model once to do it or give its real answer.
 */
export function soundsUnfinished(reply: string): boolean {
  return PROMISES.test(reply.trim().slice(-TAIL_CHARACTERS));
}

/** What the turn tells the model when its reply announced work it did not do. */
export const FINISH_NUDGE =
  "Your reply announces work you didn't do. Do it now with the tools, or give your final reply to the musician (plain, short).";
