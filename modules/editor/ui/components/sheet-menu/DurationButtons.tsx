import type { ReactNode } from "react";
import { isNote, beats, durationNotation, type ScoreEvent } from "@/modules/score";
import { NOTE_DURATION_CHOICES, toggleDotOperation } from "../../../application/note-edits";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./sheet-menu.module.css";

/**
 * Note values, drawn as rests when the event is a rest; then the dot, with `children` (the tie)
 * in the same group.
 */
export function DurationButtons({
  event,
  onCommand,
  children,
}: {
  event: ScoreEvent;
  onCommand: CommitEdit;
  children?: ReactNode;
}) {
  const { dotted } = durationNotation(event.duration);
  return (
    <>
      <div className={styles.durations} role="group" aria-label="Note duration">
        {NOTE_DURATION_CHOICES.map(({ value, label }) => (
          <button
            key={value}
            aria-label={`${label} duration`}
            aria-pressed={!event.measureRest && beats(event.duration) === value}
            onClick={() => onCommand({ type: "setDuration", eventId: event.id, duration: value }, `${label} duration`)}
          >
            {isNote(event) ? <DurationIcon value={value} /> : <RestDurationIcon value={value} />}
          </button>
        ))}
      </div>
      <div className={styles.durations} role="group" aria-label="Dot and tie">
        <button
          aria-label="Dotted duration"
          aria-pressed={dotted && !event.measureRest}
          disabled={event.measureRest}
          onClick={() => onCommand(toggleDotOperation(event), "Changed dotted duration")}
        >
          <span className={styles.dot}>·</span>
        </button>
        {children}
      </div>
    </>
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

/** A rest of each value, on a short staff line where the whole and half rests need one. */
function RestDurationIcon({ value }: { value: number }) {
  return (
    <svg viewBox="0 0 26 32" width="20" height="26" aria-hidden="true" fill="currentColor">
      {value === 4 && (
        <>
          <path d="M4 12H22" stroke="currentColor" strokeWidth="1.2" />
          <rect x="7" y="12" width="12" height="5" />
        </>
      )}
      {value === 2 && (
        <>
          <path d="M4 18H22" stroke="currentColor" strokeWidth="1.2" />
          <rect x="7" y="13" width="12" height="5" />
        </>
      )}
      {value === 1 && <path d="M11 4 L16 9 L13 14 L16 19 Q9 16 13 25 Q5 19 11 17 L8 13 L11 8 Z" />}
      {value <= 0.5 && (
        <>
          <circle cx="10" cy="10" r="2.6" />
          <path d="M10 10 Q14 13 18 8 L12 26" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </>
      )}
      {value === 0.25 && (
        <>
          <circle cx="8" cy="17" r="2.6" />
          <path d="M8 17 Q12 20 16 15" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </>
      )}
    </svg>
  );
}
