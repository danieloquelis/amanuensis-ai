import type { ScoreEvent } from "@/modules/score";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import { AccidentalButtons } from "../sheet-menu/AccidentalButtons";
import { ArticulationButtons } from "../sheet-menu/ArticulationButtons";
import { DurationButtons } from "../sheet-menu/DurationButtons";
import { TieButton } from "../sheet-menu/TieButton";
import styles from "./selection.module.css";

/**
 * Everything about one note or rest. A note gets two rows: rhythm (duration, dot, tie), then the
 * note itself (accidental, articulation); Delete makes it a rest. A rest needs one row: rest
 * values, fermata and Add note. Escape hands focus back to the sheet without a selection.
 */
export function NoteActions({ editor, event }: { editor: ScoreEditor; event: ScoreEvent }) {
  return (
    <div
      className={styles.rows}
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
          <TieButton event={event} onCommand={editor.commit} />
        </DurationButtons>
        {!event.pitch && (
          <>
            <ArticulationButtons event={event} onCommand={editor.commit} />
            <AddNoteButton onAdd={() => editor.toggleRest(event.id)} />
          </>
        )}
      </div>
      {event.pitch && (
        <div className={styles.actions}>
          <AccidentalButtons event={event} onCommand={editor.commit} />
          <ArticulationButtons event={event} onCommand={editor.commit} />
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
