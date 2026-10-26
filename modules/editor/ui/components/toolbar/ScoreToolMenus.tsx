import { meterName, type Score } from "@/modules/score";
import type { Selection } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { BarTools } from "./BarTools";
import { DynamicsTools } from "./DynamicsTools";
import { MeterTools } from "./MeterTools";
import { RepeatTools } from "./RepeatTools";
import { TextIndicationTools } from "./TextIndicationTools";
import { ToolPopover } from "./ToolPopover";
import styles from "./toolbar.module.css";

type ScoreToolMenusProps = {
  score: Score;
  selection: Selection | null;
  ready: boolean;
  onCommand: CommitEdit;
  onError: (message: string) => void;
};

/**
 * Notation toolbar. Every popover acts on the selected bar (bar 1 when nothing is selected);
 * keys remount each tool when the target changes so stale form state never applies.
 */
export function ScoreToolMenus({ score, selection, ready, onCommand, onError }: ScoreToolMenusProps) {
  const index = selection?.measureIndex ?? 0;
  const measure = score.measures[index];
  const anchorKey = selection?.event.id ?? measure.id;
  const measureTools = { score, index, onCommand, onError };
  const indicationTools = { score, selection, measureIndex: index, onCommand };

  return (
    <div className={styles.tools} role="group" aria-label="Notation toolbar">
      <ToolPopover label={meterName(measure.meter)} accessibleLabel="Change time signature" disabled={!ready}>
        <MeterTools key={`meter-${measure.id}`} {...measureTools} />
      </ToolPopover>
      <ToolPopover label="ƒ" accessibleLabel="Dynamics" disabled={!ready} symbol>
        <DynamicsTools key={`dynamic-${anchorKey}`} {...indicationTools} />
      </ToolPopover>
      <ToolPopover label="Text" accessibleLabel="Text indications" disabled={!ready}>
        <TextIndicationTools key={`text-${anchorKey}`} {...indicationTools} />
      </ToolPopover>
      <ToolPopover label=":‖" accessibleLabel="Repeats" disabled={!ready} symbol>
        <RepeatTools key={`repeat-${measure.id}`} {...measureTools} />
      </ToolPopover>
      <ToolPopover label="+ Bar" accessibleLabel="Measure actions" disabled={!ready}>
        <BarTools key={`bars-${measure.id}`} {...measureTools} />
      </ToolPopover>
    </div>
  );
}
