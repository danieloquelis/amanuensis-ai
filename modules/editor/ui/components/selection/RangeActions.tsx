import type { Edit } from "../../../application/note-edits";
import {
  allHave,
  octaveEdit,
  PHRASE_ARTICULATIONS,
  phraseArticulationEdit,
  slurEdit,
  slurOver,
} from "../../../application/range-edits";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import { ARTICULATION_SYMBOLS } from "../sheet-menu/ArticulationButtons";
import styles from "./selection.module.css";

/**
 * Tools for a run of picked notes (`ids`, in score order): slur the phrase, give every note an
 * articulation, or move it all an octave. Escape hands focus back to the sheet without a selection.
 */
export function RangeActions({ editor, ids }: { editor: ScoreEditor; ids: string[] }) {
  const { score } = editor;
  const apply = (edit: Edit | null) => edit && editor.commit(edit.operation, edit.receipt);
  const slurred = !!slurOver(score, ids);
  return (
    <div
      className={styles.actions}
      role="toolbar"
      aria-label="Selected notes actions"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        editor.select(null);
        e.stopPropagation();
      }}
    >
      <div role="group" aria-label="Slur">
        <button
          aria-label="Slur"
          aria-pressed={slurred}
          disabled={!slurred && !slurEdit(score, ids)}
          onClick={() => apply(slurEdit(score, ids))}
        >
          <SlurIcon />
        </button>
      </div>
      <div role="group" aria-label="Articulation">
        {PHRASE_ARTICULATIONS.map((articulation) => (
          <button
            key={articulation}
            aria-label={articulation}
            aria-pressed={allHave(score, ids, articulation)}
            onClick={() => apply(phraseArticulationEdit(score, ids, articulation))}
          >
            {ARTICULATION_SYMBOLS[articulation]}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Octave">
        <button aria-label="Up an octave" onClick={() => apply(octaveEdit(ids, 1))}>
          ↑8
        </button>
        <button aria-label="Down an octave" onClick={() => apply(octaveEdit(ids, -1))}>
          ↓8
        </button>
      </div>
    </div>
  );
}

/** A long, shallow arc: the phrase mark. */
function SlurIcon() {
  return (
    <svg viewBox="0 0 26 12" width="24" height="11" aria-hidden="true">
      <path d="M 1 9 C 7 1 19 1 25 9 C 19 4 7 4 1 9 Z" fill="currentColor" />
    </svg>
  );
}
