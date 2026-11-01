import { isNote, isRest, type ScoreEvent } from "@/modules/score";
import { isOnDrumPart } from "../../../application/drum-edits";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import { AccidentalButtons } from "../sheet-menu/AccidentalButtons";
import { ArticulationButtons } from "../sheet-menu/ArticulationButtons";
import { DurationButtons } from "../sheet-menu/DurationButtons";
import { TieButton } from "../sheet-menu/TieButton";
import { TripletButton } from "../sheet-menu/TripletButton";
import styles from "./selection.module.css";
import { MakeRestButton, StackButtons } from "./StackButtons";

/**
 * Everything about one note or rest, in one layout for notes, chords, rests and drum hits. The top
 * row is how long (values | dot, triplet, tie | rest), the bottom how it sounds (accidental | articulations |
 * notes on its stem); rest and stem share a column at the right, its places kept so nothing moves. A rest needs one row: rest
 * values, fermata and Add note. With one head of a chord picked, the accidental and the remove
 * button act on that head. A drum hit has no tie or accidentals; which piece a head strikes is set
 * by dragging it up or down the staff. Escape hands focus back to the sheet without a selection.
 */
export function NoteActions({ editor, event }: { editor: ScoreEditor; event: ScoreEvent }) {
  const drums = isOnDrumPart(editor.score, event.id);
  const head = editor.selectedId === event.id ? editor.selectedHead : null;
  return (
    <div
      // A drum hit has few buttons: its two rows sit side by side as one line.
      className={drums ? `${styles.rows} ${styles.oneLine}` : styles.rows}
      role="toolbar"
      aria-label="Selected note actions"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        editor.select(null);
        e.stopPropagation();
      }}
    >
      <div className={styles.actions}>
        <DurationButtons event={event} onCommand={editor.commit}>
          <TripletButton score={editor.score} event={event} onCommand={editor.commit} />
          {!drums && <TieButton event={event} onCommand={editor.commit} />}
        </DurationButtons>
        {isNote(event) && <MakeRestButton editor={editor} event={event} />}
        {isRest(event) && (
          <>
            <ArticulationButtons event={event} onCommand={editor.commit} />
            <AddNoteButton onAdd={() => editor.toggleRest(event.id)} />
          </>
        )}
      </div>
      {isNote(event) && (
        <div className={styles.actions}>
          {!drums && <AccidentalButtons event={event} head={head} onCommand={editor.commit} />}
          <ArticulationButtons event={event} drums={drums} onCommand={editor.commit} />
          <StackButtons editor={editor} event={event} head={head} />
        </div>
      )}
    </div>
  );
}

function AddNoteButton({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      className={styles.action}
      aria-label="Add note"
      onClick={(e) => {
        // This button goes once the rest is a note: keep focus in the card so Escape still works.
        e.currentTarget.closest<HTMLElement>('[role="toolbar"]')?.querySelector("button")?.focus();
        onAdd();
      }}
    >
      <NoteIcon />
    </button>
  );
}

function NoteIcon() {
  return (
    <svg viewBox="0 0 20 24" width="16" height="20" aria-hidden="true">
      <ellipse cx="8" cy="18" rx="5" ry="3.5" transform="rotate(-20 8 18)" fill="currentColor" />
      <path d="M12.5 17V3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
