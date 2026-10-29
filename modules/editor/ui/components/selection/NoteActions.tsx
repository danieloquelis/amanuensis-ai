import type { ScoreEvent } from "@/modules/score";
import type { ScoreEditor } from "../../hooks/use-score-editor";
import { AccidentalButtons } from "../sheet-menu/AccidentalButtons";
import { ArticulationButtons } from "../sheet-menu/ArticulationButtons";
import { DurationButtons } from "../sheet-menu/DurationButtons";
import styles from "./selection.module.css";

/**
 * Everything about one note or rest, in one row: duration, accidental, articulation and
 * note/rest. Escape hands focus back to the sheet without a selection.
 */
export function NoteActions({ editor, event }: { editor: ScoreEditor; event: ScoreEvent }) {
  return (
    <div
      className={styles.actions}
      role="toolbar"
      aria-label="Selected note actions"
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        editor.select(null);
        e.stopPropagation();
      }}
    >
      <DurationButtons event={event} onCommand={editor.commit} />
      <AccidentalButtons event={event} onCommand={editor.commit} />
      <ArticulationButtons event={event} onCommand={editor.commit} />
      <button
        className={styles.action}
        aria-label={event.pitch ? "Make rest" : "Add note"}
        onClick={() => editor.toggleRest(event.id)}
      >
        {event.pitch ? <RestIcon /> : <NoteIcon />}
      </button>
    </div>
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

function RestIcon() {
  return (
    <svg viewBox="0 0 20 24" width="16" height="20" aria-hidden="true">
      <path d="M 8 2 L 13 7 L 10 12 L 13 17 Q 6 14 10 22 Q 3 17 8 15 L 5 11 L 8 6 Z" fill="currentColor" />
    </svg>
  );
}
