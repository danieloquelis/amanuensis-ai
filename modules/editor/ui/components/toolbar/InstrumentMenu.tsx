import { INSTRUMENT_IDS, INSTRUMENTS, type Score } from "@/modules/score";
import type { ToolTarget } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { InstrumentIcon } from "./InstrumentIcon";
import styles from "./toolbar.module.css";

const ICON_SIZE = 24;

/** What the selected lane's part (a note's or a bar's, else the first part) is played on, one icon per instrument. The notes keep their sound. */
export function InstrumentMenu({
  score,
  target,
  onCommand,
  onDone,
}: {
  score: Score;
  target: ToolTarget;
  onCommand: CommitEdit;
  onDone: () => void;
}) {
  const part = score.parts.find((p) => p.id === target.partId)!;
  return (
    <div className={`${styles.grid} ${styles.wideGrid}`} role="group" aria-label="Instrument">
      {INSTRUMENT_IDS.map((instrument) => (
        <button
          key={instrument}
          aria-label={INSTRUMENTS[instrument].name}
          title={INSTRUMENTS[instrument].name}
          aria-pressed={part.instrument === instrument}
          onClick={() => {
            if (part.instrument !== instrument) {
              const name = INSTRUMENTS[instrument].name;
              onCommand({ type: "setInstrument", partId: part.id, instrument }, `Instrument: ${name}`);
            }
            onDone();
          }}
        >
          <InstrumentIcon instrument={instrument} size={ICON_SIZE} />
        </button>
      ))}
    </div>
  );
}
