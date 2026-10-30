import { eventPitches, type Operation, type ScoreEvent } from "@/modules/score";
import styles from "./sheet-menu.module.css";

const ACCIDENTALS = [
  { alter: -1, label: "Flat", symbol: "♭" },
  { alter: 0, label: "Natural", symbol: "♮" },
  { alter: 1, label: "Sharp", symbol: "♯" },
] as const;

/** ♭ ♮ ♯ for a pitched note (with `head`, that note of a chord); renders nothing for a rest. */
export function AccidentalButtons({
  event,
  head = null,
  onCommand,
}: {
  event: ScoreEvent;
  head?: number | null;
  onCommand: (operation: Operation, receipt: string) => unknown;
}) {
  const notes = eventPitches(event);
  const pitch = head !== null && notes.length > 1 ? notes[head] : event.pitch;
  if (!pitch) return null;
  const change = (alter: -1 | 0 | 1): Operation =>
    head !== null && notes.length > 1
      ? { type: "setNotes", eventId: event.id, pitches: notes.map((p, k) => (k === head ? { ...p, alter } : p)) }
      : { type: "setPitch", eventId: event.id, pitch: { ...pitch, alter } };
  return (
    <div className={styles.row} role="group" aria-label="Accidental">
      {ACCIDENTALS.map(({ alter, label, symbol }) => (
        <button
          key={alter}
          aria-label={label}
          aria-pressed={pitch.alter === alter}
          onClick={() => onCommand(change(alter), "Changed accidental")}
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}
