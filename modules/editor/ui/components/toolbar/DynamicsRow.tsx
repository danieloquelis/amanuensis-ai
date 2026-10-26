import { DYNAMICS, type Score } from "@/modules/score";
import type { ToolTarget } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./toolbar.module.css";

/** pp–ff on the selected note (or bar 1). Clicking the current dynamic removes it. */
export function DynamicsRow({ score, target, onCommand }: { score: Score; target: ToolTarget; onCommand: CommitEdit }) {
  const anchorId = target.eventId ?? target.measureId;
  const current = score.annotations.find((a) => a.targetId === anchorId && a.kind === "dynamic");
  return (
    <div className={`${styles.grid} ${styles.wideGrid}`} role="group" aria-label="Dynamics">
      {DYNAMICS.map((dynamic) => (
        <button
          key={dynamic}
          className={styles.music}
          aria-label={`Set dynamic ${dynamic}`}
          aria-pressed={current?.text === dynamic}
          onClick={() =>
            current?.text === dynamic
              ? onCommand({ type: "removeNotation", id: current.id }, "Removed dynamic")
              : onCommand({ type: "putAnnotation", targetId: anchorId, kind: "dynamic", text: dynamic }, `${dynamic}`)
          }
        >
          {dynamic}
        </button>
      ))}
    </div>
  );
}
