import { TEMPO_RANGE, type Measure, type Score } from "@/modules/score";
import type { CheckedCommit } from "./SheetContextMenu";
import styles from "./sheet-menu.module.css";

/** Bar actions plus an optional local tempo. */
export function BarMenuSection({ score, measure, commit }: { score: Score; measure: Measure; commit: CheckedCommit }) {
  const action = (label: string, run: () => void, disabled = false) => (
    <button className={styles.action} disabled={disabled} onClick={run}>
      {label}
    </button>
  );
  return (
    <>
      {action("Insert bar", () => commit({ type: "appendMeasure", afterMeasureId: measure.id }, "Inserted bar"))}
      {action("Duplicate", () => commit({ type: "duplicateMeasure", measureId: measure.id }, "Duplicated bar"))}
      {action("Clear", () => commit({ type: "clearMeasure", measureId: measure.id }, "Cleared bar"))}
      {action(
        "Delete",
        () => commit({ type: "deleteMeasure", measureId: measure.id }, "Deleted bar"),
        score.measures.length === 1,
      )}
      {measure.width !== undefined &&
        action("Reset spacing", () =>
          commit({ type: "setMeasureWidth", measureId: measure.id, width: null }, "Reset bar spacing"),
        )}
      <label className={styles.inline}>
        ♩ =
        <input
          aria-label="Tempo from this bar"
          type="number"
          min={TEMPO_RANGE.min}
          max={TEMPO_RANGE.max}
          placeholder="—"
          defaultValue={measure.tempo ?? ""}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const value = e.currentTarget.value;
            if (!value) commit({ type: "removeTempo", measureId: measure.id }, "Removed tempo change");
            else commit({ type: "setTempo", measureId: measure.id, tempo: Number(value) }, `Tempo ${value}`);
          }}
        />
      </label>
    </>
  );
}
