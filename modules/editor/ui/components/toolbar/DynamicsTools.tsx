import { DYNAMICS, type Score } from "@/modules/score";
import type { Selection } from "../../../application/selection";
import { useIndicationAnchor } from "../../hooks/use-indication-anchor";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { AnchorSelect } from "./AnchorSelect";
import styles from "./toolbar.module.css";

type DynamicsToolsProps = {
  score: Score;
  selection: Selection | null;
  measureIndex: number;
  onCommand: CommitEdit;
};

/** One dynamic per anchor; choosing another replaces it. */
export function DynamicsTools({ score, selection, measureIndex, onCommand }: DynamicsToolsProps) {
  const { anchor, setAnchor, targetId, anchored, subject, placement } = useIndicationAnchor(
    score,
    selection,
    measureIndex,
  );
  const dynamics = anchored.filter((a) => a.kind === "dynamic");
  return (
    <section>
      <h2>Dynamics · {subject}</h2>
      <AnchorSelect anchor={anchor} hasSelection={!!selection} measureIndex={measureIndex} onChange={setAnchor} />
      <div className={styles.dynamics}>
        {DYNAMICS.map((dynamic) => (
          <button
            key={dynamic}
            aria-label={`Set dynamic ${dynamic}`}
            aria-pressed={dynamics.some((a) => a.text === dynamic)}
            onClick={() =>
              onCommand(
                { type: "putAnnotation", targetId, kind: "dynamic", text: dynamic },
                `Set ${dynamic} at ${placement}`,
              )
            }
          >
            {dynamic}
          </button>
        ))}
      </div>
      {dynamics.map((a) => (
        <div className={styles.item} key={a.id}>
          <span>{a.text}</span>
          <div>
            <button
              aria-label={`Remove indication ${a.text}`}
              onClick={() => onCommand({ type: "removeNotation", id: a.id }, "Removed indication")}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
