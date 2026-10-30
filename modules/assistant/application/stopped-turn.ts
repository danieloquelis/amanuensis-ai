/** Receipt of the edits a stopped turn keeps, as one undo step. */
export const STOPPED_RECEIPT = "Kept what the assistant wrote before it was stopped";

/** What a stopped turn says: whether it had written anything, and whether that was kept. */
export function stoppedReply(written: number, kept: boolean): string {
  if (!written) return "Stopped.";
  if (kept) return "Stopped. What I'd written so far is kept; Undo takes it back.";
  return "Stopped. The score changed meanwhile, so what I'd written isn't kept.";
}
