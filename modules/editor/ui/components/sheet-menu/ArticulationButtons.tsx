import { isNote, ARTICULATIONS, type Articulation, type Operation, type ScoreEvent } from "@/modules/score";
import styles from "./sheet-menu.module.css";

export const ARTICULATION_SYMBOLS: Record<Articulation, string> = {
  staccato: "•",
  accent: ">",
  tenuto: "—",
  fermata: "𝄐",
};

/** Drums are played with accents, and held with a fermata; the other marks are for pitched notes. */
const DRUM_ARTICULATIONS: readonly Articulation[] = ["accent", "fermata"];

/** One toggle per articulation; clicking the current one removes it. Rests only take fermatas. */
export function ArticulationButtons({
  event,
  drums = false,
  onCommand,
}: {
  event: ScoreEvent;
  /** A drum hit: only the marks drummers use. */
  drums?: boolean;
  onCommand: (operation: Operation, receipt: string) => unknown;
}) {
  const offered = drums ? DRUM_ARTICULATIONS : ARTICULATIONS;
  const articulations = offered.filter((a) => isNote(event) || a === "fermata");
  return (
    <div className={styles.row} role="group" aria-label="Articulation">
      {articulations.map((articulation) => (
        <button
          key={articulation}
          aria-label={articulation}
          aria-pressed={event.articulation === articulation}
          onClick={() =>
            onCommand(
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
  );
}
