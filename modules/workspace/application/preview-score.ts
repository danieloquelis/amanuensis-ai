import { applyCommand, type Score } from "@/modules/score";

/** A Home card shows at most this many instruments; the rest of the ensemble is in the card's summary. */
export const PREVIEW_PARTS = 3;

/**
 * The score as its Home preview draws it: only the first `PREVIEW_PARTS` instruments. The others
 * are taken out with `removePart` on a copy, so their notes and markings go with them; the saved
 * song is untouched.
 */
export function previewScore(score: Score): Score {
  return score.parts.slice(PREVIEW_PARTS).reduce(
    (draft, part, index) =>
      applyCommand(draft, {
        requestId: `preview-${index}`,
        expectedRevision: draft.revision,
        operation: { type: "removePart", partId: part.id },
      }),
    score,
  );
}
