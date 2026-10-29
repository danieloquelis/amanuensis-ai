import { ARTICULATIONS, type Articulation, type Operation, type ScoreEvent } from "@/modules/score";
import styles from "./sheet-menu.module.css";

export const ARTICULATION_SYMBOLS: Record<Articulation, string> = {
  staccato: "•",
  accent: ">",
  tenuto: "—",
  fermata: "𝄐",
};

/** One toggle per articulation; clicking the current one removes it. Rests only take fermatas. */
export function ArticulationButtons({
  event,
  onCommand,
}: {
  event: ScoreEvent;
  onCommand: (operation: Operation, receipt: string) => unknown;
}) {
  const articulations = ARTICULATIONS.filter((a) => event.pitch || a === "fermata");
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
