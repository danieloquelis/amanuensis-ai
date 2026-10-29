import type { KeySignature, ScoreEvent } from "@/modules/score";
import { toggleRestOperation } from "../../../application/note-edits";
import { AccidentalButtons } from "./AccidentalButtons";
import { ArticulationButtons } from "./ArticulationButtons";
import type { CheckedCommit } from "./SheetContextMenu";
import { TieButton } from "./TieButton";
import styles from "./sheet-menu.module.css";

/** Accidental, articulation, tie and note/rest conversion for one event (durations live in the floating strip). */
export function NoteMenuSection({
  event,
  keySignature,
  commit,
}: {
  event: ScoreEvent;
  keySignature: KeySignature;
  commit: CheckedCommit;
}) {
  const pitch = event.pitch;
  return (
    <>
      <AccidentalButtons event={event} onCommand={commit} />
      <ArticulationButtons event={event} onCommand={commit} />
      {pitch && (
        <div className={styles.row} role="group" aria-label="Tie">
          <TieButton event={event} onCommand={commit} />
        </div>
      )}
      <button
        aria-label={pitch ? "Make rest" : "Add note"}
        className={styles.action}
        onClick={() =>
          commit(toggleRestOperation(event, keySignature), pitch ? "Replaced note with rest" : "Added note")
        }
      >
        {pitch ? "Make rest" : "Add note"}
      </button>
    </>
  );
}
