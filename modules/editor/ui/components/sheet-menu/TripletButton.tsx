import { useMemo } from "react";
import type { Score, ScoreEvent } from "@/modules/score";
import { tripletEdit } from "../../../application/note-edits";
import { checkOperation } from "../../../application/operation-check";
import type { CommitEdit } from "../../hooks/use-score-editor";

/**
 * Splits the selected value into a triplet, or (pressed, on a triplet's note) turns the triplet
 * back into one value. Disabled where the split can't be made (a dotted value, a compound meter,
 * off the beat); the reason is its tooltip.
 */
export function TripletButton({ score, event, onCommand }: { score: Score; event: ScoreEvent; onCommand: CommitEdit }) {
  // A dry run of the edit says whether it can be made: once per score and note, not per render.
  const { edit, problem } = useMemo(() => {
    const edit = tripletEdit(event);
    return { edit, problem: checkOperation(score, edit.operation) };
  }, [score, event]);
  return (
    <button
      aria-label="Triplet"
      aria-pressed={!!event.tuplet}
      disabled={problem !== null}
      title={problem ?? undefined}
      onClick={() => onCommand(edit.operation, edit.receipt)}
    >
      <TripletIcon />
    </button>
  );
}

/** A small bracket over an italic 3, as the sheet draws a triplet. */
function TripletIcon() {
  return (
    <svg viewBox="0 0 22 16" width="22" height="16" aria-hidden="true">
      <path d="M2 10 V5 H7 M15 5 H20 V10" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <text
        x="11"
        y="10"
        textAnchor="middle"
        fontFamily="Georgia, serif"
        fontStyle="italic"
        fontWeight="bold"
        fontSize="10"
        fill="currentColor"
      >
        3
      </text>
    </svg>
  );
}
