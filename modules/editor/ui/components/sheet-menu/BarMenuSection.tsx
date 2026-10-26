import { useState } from "react";
import { meterName, type Measure, type Meter, type Operation, type Score } from "@/modules/score";
import { checkOperation } from "../../../application/operation-check";
import type { CheckedCommit } from "./SheetContextMenu";
import styles from "./sheet-menu.module.css";

const QUICK_METERS: Meter[] = [
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 6, denominator: 8 },
];

type BarMenuSectionProps = {
  score: Score;
  measure: Measure;
  commit: CheckedCommit;
  onProblem: (message: string) => void;
};

/**
 * Quick meter changes and bar actions. A meter that would cut notes is not applied; instead the
 * menu offers to fit the rhythm proportionally.
 */
export function BarMenuSection({ score, measure, commit, onProblem }: BarMenuSectionProps) {
  const [overflowingMeter, setOverflowingMeter] = useState<Meter | null>(null);
  const setMeter = (meter: Meter, policy: "preserve" | "scale"): Operation => ({
    type: "setMeter",
    measureIds: [measure.id],
    meter,
    policy,
  });

  const chooseMeter = (meter: Meter) => {
    if (checkOperation(score, setMeter(meter, "preserve"))) {
      setOverflowingMeter(meter);
      onProblem("This bar contains more music than the new meter allows.");
      return;
    }
    commit(setMeter(meter, "preserve"), "Changed bar meter");
  };

  return (
    <>
      <div className={styles.meters} role="group" aria-label="Time signature">
        {QUICK_METERS.map((meter) => (
          <button key={meterName(meter)} onClick={() => chooseMeter(meter)}>
            {meter.numerator}/{meter.denominator}
          </button>
        ))}
      </div>
      {overflowingMeter && (
        <button
          className={styles.action}
          onClick={() => commit(setMeter(overflowingMeter, "scale"), "Fit rhythm to new meter")}
        >
          Fit rhythm to {meterName(overflowingMeter)}
        </button>
      )}
      <button
        className={styles.action}
        onClick={() => commit({ type: "appendMeasure", afterMeasureId: measure.id }, "Inserted measure")}
      >
        Insert bar after
      </button>
      <button
        className={styles.action}
        onClick={() => commit({ type: "duplicateMeasure", measureId: measure.id }, "Duplicated measure")}
      >
        Duplicate bar
      </button>
      <button
        className={styles.action}
        onClick={() => commit({ type: "clearMeasure", measureId: measure.id }, "Cleared measure to rests")}
      >
        Clear to rests
      </button>
      <button
        className={styles.action}
        disabled={score.measures.length === 1}
        onClick={() => commit({ type: "deleteMeasure", measureId: measure.id }, "Deleted measure")}
      >
        Delete bar
      </button>
      <button
        className={styles.action}
        onClick={() => commit({ type: "setMeasureWidth", measureId: measure.id, width: null }, "Reset bar spacing")}
      >
        Reset spacing
      </button>
    </>
  );
}
