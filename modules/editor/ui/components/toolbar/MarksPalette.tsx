import { MARK_KINDS, MARK_LABELS, type Score } from "@/modules/score";
import { addMark, addSection, barStyleEdit, endRepeatEdit, startRepeatEdit } from "../../../application/notation-edits";
import type { Edit } from "../../../application/note-edits";
import { checkOperation } from "../../../application/operation-check";
import type { CommitEdit } from "../../hooks/use-score-editor";
import styles from "./toolbar.module.css";

const STYLES = [
  { value: "notes", label: "Notes" },
  { value: "slashes", label: "////", ariaLabel: "Slash bar" },
  { value: "repeat", label: "%", ariaLabel: "Repeat previous bar" },
] as const;

type MarksPaletteProps = {
  score: Score;
  barIndex: number;
  onCommand: CommitEdit;
  onError: (message: string) => void;
};

/**
 * Form and lead-sheet marks for the selected bar. Buttons add; to remove something, select it
 * on the sheet and press Delete.
 */
export function MarksPalette({ score, barIndex, onCommand, onError }: MarksPaletteProps) {
  const style = score.measures[barIndex].style ?? "notes";
  const apply = (edit: Edit | null) => {
    if (!edit) return;
    const problem = checkOperation(score, edit.operation);
    if (problem) onError(problem);
    else onCommand(edit.operation, edit.receipt);
  };
  return (
    <>
      <div className={styles.segmented} role="radiogroup" aria-label="Bar shows">
        {STYLES.map((option) => (
          <button
            key={option.value}
            role="radio"
            aria-checked={style === option.value}
            aria-label={"ariaLabel" in option ? option.ariaLabel : option.label}
            onClick={() => apply(barStyleEdit(score, barIndex, option.value))}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className={`${styles.grid} ${styles.wideGrid}`} role="group" aria-label="Marks">
        <button onClick={() => apply(addSection(score, barIndex))}>Section</button>
        <button aria-label="Start repeat" onClick={() => apply(startRepeatEdit(score, barIndex))}>
          |:
        </button>
        <button aria-label="End repeat" onClick={() => apply(endRepeatEdit(score, barIndex))}>
          :|
        </button>
        {MARK_KINDS.map((kind) => (
          <button key={kind} onClick={() => apply(addMark(score, barIndex, kind))}>
            {MARK_LABELS[kind]}
          </button>
        ))}
      </div>
    </>
  );
}
