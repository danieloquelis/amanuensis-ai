import type { Score } from "@/modules/score";
import { usePendingChange } from "../../hooks/use-pending-change";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { PendingChangePanel } from "./PendingChangePanel";
import styles from "./toolbar.module.css";

type BarToolsProps = {
  score: Score;
  index: number;
  onCommand: CommitEdit;
  onError: (message: string) => void;
};

/** Insert and duplicate apply directly; clearing and deleting are previewed first. */
export function BarTools({ score, index, onCommand, onError }: BarToolsProps) {
  const measure = score.measures[index];
  const change = usePendingChange(score, onCommand, onError);
  const bar = index + 1;
  return (
    <div onChange={change.discard}>
      <section>
        <h2>Bar {bar}</h2>
        <div className={styles.actions}>
          <button
            onClick={() =>
              onCommand({ type: "appendMeasure", afterMeasureId: measure.id }, `Inserted a bar after bar ${bar}`)
            }
          >
            Insert after
          </button>
          <button
            onClick={() => onCommand({ type: "duplicateMeasure", measureId: measure.id }, `Duplicated bar ${bar}`)}
          >
            Duplicate
          </button>
          <button
            onClick={() =>
              change.propose({ type: "clearMeasure", measureId: measure.id }, `Replace bar ${bar} with rests`)
            }
          >
            Clear to rests
          </button>
          <button
            disabled={score.measures.length === 1}
            onClick={() =>
              change.propose(
                { type: "deleteMeasure", measureId: measure.id },
                `Delete bar ${bar} and its anchored indications`,
              )
            }
          >
            Delete bar
          </button>
        </div>
      </section>
      <PendingChangePanel change={change} />
    </div>
  );
}
