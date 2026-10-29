import { findEvent, scoreKey, type Score, type ScoreEvent } from "@/modules/score";
import { toggleRestOperation } from "../../../application/note-edits";
import { hasSecondVoice, secondVoiceEdit } from "../../../application/voice-edits";
import { AccidentalButtons } from "./AccidentalButtons";
import { ArticulationButtons } from "./ArticulationButtons";
import type { CheckedCommit } from "./SheetContextMenu";
import { TieButton } from "./TieButton";
import styles from "./sheet-menu.module.css";

/**
 * Accidental, articulation, tie and note/rest conversion for one event, and a second voice for
 * its bar (durations live in the floating strip).
 */
export function NoteMenuSection({ score, event, commit }: { score: Score; event: ScoreEvent; commit: CheckedCommit }) {
  const pitch = event.pitch;
  const keySignature = scoreKey(score);
  const measureId = findEvent(score, event.id)?.measure.id;
  const voiceEdit = measureId ? secondVoiceEdit(score, measureId) : null;
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
      {voiceEdit && measureId && (
        <button className={styles.action} onClick={() => commit(voiceEdit.operation, voiceEdit.receipt)}>
          {hasSecondVoice(score, measureId) ? "Remove second voice" : "Add second voice"}
        </button>
      )}
    </>
  );
}
