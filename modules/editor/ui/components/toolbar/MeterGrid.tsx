import { METERS, meterName, type Meter, type Score } from "@/modules/score";
import { classNames } from "@/shared/ui/class-names";
import { meterEdit } from "../../../application/notation-edits";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./toolbar.module.css";

type MeterGridProps = {
  score: Score;
  barIndex: number;
  onCommand: CommitEdit;
  onError: (message: string) => void;
  onDone?: () => void;
};

/** One click sets the time signature from this bar to the next change. */
export function MeterGrid({ score, barIndex, onCommand, onError, onDone }: MeterGridProps) {
  const current = meterName(score.measures[barIndex].meter);
  return (
    <div className={classNames(styles.grid, styles.meterGrid)} role="group" aria-label="Time signature">
      {METERS.map((name) => (
        <button
          key={name}
          aria-pressed={name === current}
          onClick={() => {
            const [numerator, denominator] = name.split("/").map(Number);
            const edit = meterEdit(score, barIndex, { numerator, denominator } as Meter);
            if ("error" in edit) onError(edit.error);
            else onCommand(edit.operation, edit.receipt);
            onDone?.();
          }}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
