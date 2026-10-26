import { useState } from "react";
import { pitchName, type Annotation, type Score } from "@/modules/score";
import type { Selection } from "../../application/selection";

export type AnchorKind = "note" | "bar";

/**
 * Where a new indication attaches: the selected note/rest, or the start of its bar.
 * Defaults to the note when something is selected.
 */
export function useIndicationAnchor(score: Score, selection: Selection | null, measureIndex: number) {
  const [anchor, setAnchor] = useState<AnchorKind>(selection ? "note" : "bar");
  const measure = score.measures[measureIndex];
  const targetId = anchor === "note" && selection ? selection.event.id : measure.id;
  const anchored: Annotation[] = score.annotations.filter((a) => a.targetId === targetId);
  return {
    anchor,
    setAnchor,
    targetId,
    anchored,
    /** Heading suffix: the selected pitch, or the bar. */
    subject: selection ? pitchName(selection.event.pitch) : `bar ${measureIndex + 1}`,
    /** Receipt suffix for a newly set indication. */
    placement: anchor === "note" ? "selection" : `bar ${measureIndex + 1}`,
  };
}
