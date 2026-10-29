import type { Operation, ScoreEvent } from "@/modules/score";
import styles from "./sheet-menu.module.css";

const ACCIDENTALS = [
  { alter: -1, label: "Flat", symbol: "♭" },
  { alter: 0, label: "Natural", symbol: "♮" },
  { alter: 1, label: "Sharp", symbol: "♯" },
] as const;

/** ♭ ♮ ♯ for a pitched note; renders nothing for a rest. */
export function AccidentalButtons({
  event,
  onCommand,
}: {
  event: ScoreEvent;
  onCommand: (operation: Operation, receipt: string) => unknown;
}) {
  const pitch = event.pitch;
  if (!pitch) return null;
  return (
    <div className={styles.row} role="group" aria-label="Accidental">
      {ACCIDENTALS.map(({ alter, label, symbol }) => (
        <button
          key={alter}
          aria-label={label}
          aria-pressed={pitch.alter === alter}
          onClick={() =>
            onCommand({ type: "setPitch", eventId: event.id, pitch: { ...pitch, alter } }, "Changed accidental")
          }
        >
          {symbol}
        </button>
      ))}
    </div>
  );
}
