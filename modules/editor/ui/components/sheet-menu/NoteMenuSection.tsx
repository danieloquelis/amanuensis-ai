import { ARTICULATIONS, type Articulation, type KeySignature, type ScoreEvent } from "@/modules/score";
import { toggleRestOperation } from "../../../application/note-edits";
import type { CheckedCommit } from "./SheetContextMenu";
import styles from "./sheet-menu.module.css";

const ACCIDENTALS = [
  { alter: -1, label: "Flat", symbol: "♭" },
  { alter: 0, label: "Natural", symbol: "♮" },
  { alter: 1, label: "Sharp", symbol: "♯" },
] as const;

const ARTICULATION_SYMBOLS: Record<Articulation, string> = {
  staccato: "•",
  accent: ">",
  tenuto: "—",
  fermata: "𝄐",
};

/** Accidental, articulation and note/rest conversion for one event (durations live in the floating strip). */
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
  // Rests only take fermatas.
  const articulations = ARTICULATIONS.filter((a) => pitch || a === "fermata");
  return (
    <>
      {pitch && (
        <div className={styles.row} role="group" aria-label="Accidental">
          {ACCIDENTALS.map(({ alter, label, symbol }) => (
            <button
              key={alter}
              aria-label={label}
              title={label}
              aria-pressed={pitch.alter === alter}
              onClick={() =>
                commit({ type: "setPitch", eventId: event.id, pitch: { ...pitch, alter } }, "Changed accidental")
              }
            >
              {symbol}
            </button>
          ))}
        </div>
      )}
      <div className={styles.row} role="group" aria-label="Articulation">
        {articulations.map((articulation) => (
          <button
            key={articulation}
            aria-label={articulation}
            title={articulation}
            aria-pressed={event.articulation === articulation}
            onClick={() =>
              commit(
                {
                  type: "setArticulation",
                  eventId: event.id,
                  articulation: event.articulation === articulation ? null : articulation,
                },
                `Changed ${articulation}`,
              )
            }
          >
            {ARTICULATION_SYMBOLS[articulation]}
          </button>
        ))}
      </div>
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
