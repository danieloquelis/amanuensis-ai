/**
 * Files attached to a turn (a page to read) stay with the conversation until a turn finishes the
 * work on them. A turn that was stopped, failed, or ended with a question leaves them open, so the
 * musician's next words ("continue", an answer to the question) are sent with the same files
 * instead of without them.
 */

/** The files the next turn is sent with when it attaches none of its own. */
export function filesAfter<F>(used: readonly F[], result: { question?: unknown } | null): F[] {
  const finished = result !== null && !result.question;
  return finished ? [] : [...used];
}

/** The files a turn is sent with: its own, or the ones still open from before. */
export function filesFor<F>(attached: readonly F[], open: readonly F[]): F[] {
  return attached.length ? [...attached] : [...open];
}
