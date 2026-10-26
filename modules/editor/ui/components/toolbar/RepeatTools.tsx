import { useState } from "react";
import { REPEAT_PASSES, type Score } from "@/modules/score";
import { usePendingChange } from "../../hooks/use-pending-change";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { BarRangeSelect, rangeEnd } from "./BarRangeSelect";
import { PendingChangePanel } from "./PendingChangePanel";
import styles from "./toolbar.module.css";

const PASS_CHOICES = Array.from(
  { length: REPEAT_PASSES.max - REPEAT_PASSES.min + 1 },
  (_, offset) => REPEAT_PASSES.min + offset,
);

type RepeatToolsProps = {
  score: Score;
  index: number;
  onCommand: CommitEdit;
  onError: (message: string) => void;
};

/** Creates or updates the repeat starting at this bar, and lists existing repeats. */
export function RepeatTools({ score, index, onCommand, onError }: RepeatToolsProps) {
  const measure = score.measures[index];
  const [endIndex, setEndIndex] = useState(index);
  const [passes, setPasses] = useState<number>(REPEAT_PASSES.min);
  const change = usePendingChange(score, onCommand, onError);
  const last = rangeEnd(score, index, endIndex);
  const existing = score.repeats.find((r) => r.startMeasureId === measure.id);
  const barNumberOf = (measureId: string) => score.measures.findIndex((m) => m.id === measureId) + 1;

  return (
    <div onChange={change.discard}>
      <section>
        <h2>Repeat from bar {index + 1}</h2>
        <label>
          Through bar
          <BarRangeSelect
            score={score}
            startIndex={index}
            endIndex={last}
            onChange={setEndIndex}
            ariaLabel="Repeat end bar"
          />
        </label>
        <div className={styles.row}>
          <label>
            Total passes
            <select aria-label="Repeat passes" value={passes} onChange={(e) => setPasses(Number(e.target.value))}>
              {PASS_CHOICES.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              change.propose(
                {
                  type: "putRepeat",
                  ...(existing ? { id: existing.id } : {}),
                  startMeasureId: measure.id,
                  endMeasureId: score.measures[last].id,
                  count: passes,
                },
                `Repeat bars ${index + 1}–${last + 1}, ${passes} passes`,
              )
            }
          >
            Set repeat
          </button>
        </div>
        {score.repeats.map((repeat) => (
          <div className={styles.item} key={repeat.id}>
            <span>
              Bars {barNumberOf(repeat.startMeasureId)}–{barNumberOf(repeat.endMeasureId)} · {repeat.count} passes
            </span>
            <button
              aria-label="Remove repeat"
              onClick={() => onCommand({ type: "removeNotation", id: repeat.id }, "Removed repeat")}
            >
              Remove
            </button>
          </div>
        ))}
      </section>
      <PendingChangePanel change={change} />
    </div>
  );
}
