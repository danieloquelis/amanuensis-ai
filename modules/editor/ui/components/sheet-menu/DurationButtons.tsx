import { beats, durationNotation, type ScoreEvent } from "@/modules/score";
import { NOTE_DURATION_CHOICES, toggleDotOperation } from "../../../application/note-edits";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./sheet-menu.module.css";

export function DurationButtons({ event, onCommand }: { event: ScoreEvent; onCommand: CommitEdit }) {
  const { dotted } = durationNotation(event.duration);
  return (
    <div className={styles.durations} role="group" aria-label="Note duration">
      {NOTE_DURATION_CHOICES.map(({ value, label }) => (
        <button
          key={value}
          aria-label={`${label} duration`}
          aria-pressed={!event.measureRest && beats(event.duration) === value}
          onClick={() => onCommand({ type: "setDuration", eventId: event.id, duration: value }, `${label} duration`)}
        >
          <DurationIcon value={value} />
        </button>
      ))}
      <button
        aria-label="Dotted duration"
        aria-pressed={dotted && !event.measureRest}
        disabled={event.measureRest}
        onClick={() => onCommand(toggleDotOperation(event), "Changed dotted duration")}
      >
        <span className={styles.dot}>·</span>
      </button>
    </div>
  );
}

function DurationIcon({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 26 32" width="20" height="26" aria-hidden="true">
      <ellipse
        cx="10"
        cy="23"
        rx={value === 4 ? 7 : 5.5}
        ry="3.7"
        transform="rotate(-20 10 23)"
        fill={value >= 2 ? "none" : "currentColor"}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {value < 4 && <path d="M15 22V3" stroke="currentColor" strokeWidth="1.4" />}
      {value <= 0.5 && <path d="M15 3 Q26 9 19 17 Q22 10 15 9Z" fill="currentColor" />}
      {value === 0.25 && <path d="M15 9 Q26 15 19 23 Q22 16 15 15Z" fill="currentColor" />}
    </svg>
  );
}
