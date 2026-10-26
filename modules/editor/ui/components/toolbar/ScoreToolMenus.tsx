import { meterName, scoreKey, type Score } from "@/modules/score";
import { toolTarget, type Selection } from "../../../application/selection";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { ChordEntry } from "./ChordEntry";
import { DynamicsRow } from "./DynamicsRow";
import { KeyGrid, keyLabel } from "./KeyGrid";
import { MarksPalette } from "./MarksPalette";
import { MeterGrid } from "./MeterGrid";
import { TextEntry } from "./TextEntry";
import { ToolPopover } from "./ToolPopover";
import styles from "./toolbar.module.css";

type ScoreToolMenusProps = {
  score: Score;
  selection: Selection | null;
  selectedBarId: string | null;
  ready: boolean;
  onCommand: CommitEdit;
  onError: (message: string) => void;
};

/**
 * Notation toolbar. Every tool acts on the selected note or bar (bar 1 when nothing is selected)
 * and applies on click; Undo is the safety net.
 */
export function ScoreToolMenus({ score, selection, selectedBarId, ready, onCommand, onError }: ScoreToolMenusProps) {
  const target = toolTarget(score, selection, selectedBarId);
  const barKey = `${target.measureId}-${score.revision}`;
  return (
    <div className={styles.tools} role="group" aria-label="Notation toolbar">
      <ToolPopover
        label={meterName(score.measures[target.barIndex].meter)}
        accessibleLabel="Change time signature"
        disabled={!ready}
      >
        {(close) => (
          <MeterGrid score={score} barIndex={target.barIndex} onCommand={onCommand} onError={onError} onDone={close} />
        )}
      </ToolPopover>
      <ToolPopover label={keyLabel(scoreKey(score))} accessibleLabel="Change key signature" disabled={!ready}>
        <KeyGrid key={barKey} score={score} onCommand={onCommand} />
      </ToolPopover>
      <ToolPopover label="Chord" accessibleLabel="Chord symbols" disabled={!ready}>
        <ChordEntry key={target.eventId ?? target.measureId} score={score} target={target} onCommand={onCommand} />
      </ToolPopover>
      <ToolPopover label="ƒ" accessibleLabel="Dynamics" disabled={!ready} symbol>
        <DynamicsRow score={score} target={target} onCommand={onCommand} />
      </ToolPopover>
      <ToolPopover label="Text" accessibleLabel="Text indications" disabled={!ready}>
        {(close) => <TextEntry target={target} onCommand={onCommand} onDone={close} />}
      </ToolPopover>
      <ToolPopover label="Marks" accessibleLabel="Marks and repeats" disabled={!ready}>
        <MarksPalette score={score} barIndex={target.barIndex} onCommand={onCommand} onError={onError} />
      </ToolPopover>
      <button
        className={styles.trigger}
        disabled={!ready}
        aria-label="Add bar"
        title="Add a bar after the selection"
        onClick={() => onCommand({ type: "appendMeasure", afterMeasureId: target.measureId }, "Added bar")}
      >
        + Bar
      </button>
    </div>
  );
}
