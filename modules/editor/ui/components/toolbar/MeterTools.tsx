import { useState } from "react";
import { METERS, meterName, TEMPO_RANGE, type Meter, type Score } from "@/modules/score";
import { usePendingChange } from "../../hooks/use-pending-change";
import type { CommitEdit } from "../../hooks/use-score-editor";
import { BarRangeSelect, rangeEnd } from "./BarRangeSelect";
import { PendingChangePanel } from "./PendingChangePanel";
import styles from "./toolbar.module.css";

type MeterPolicy = "preserve" | "scale";

const POLICY_HINTS: Record<MeterPolicy, string> = {
  preserve: "Adds editable space or trims trailing rests. Never cuts a note.",
  scale: "Changes note values to fit each bar. Unsupported tuplets are rejected.",
};

type MeterToolsProps = {
  score: Score;
  index: number;
  onCommand: CommitEdit;
  onError: (message: string) => void;
};

/** Time signature for a bar range (previewed before applying) and a local tempo change. */
export function MeterTools({ score, index, onCommand, onError }: MeterToolsProps) {
  const measure = score.measures[index];
  const [endIndex, setEndIndex] = useState(index);
  const [meter, setMeter] = useState(meterName(measure.meter));
  const [policy, setPolicy] = useState<MeterPolicy>("preserve");
  const change = usePendingChange(score, onCommand, onError);
  const last = rangeEnd(score, index, endIndex);

  const previewMeterChange = () => {
    const [numerator, denominator] = meter.split("/").map(Number);
    const measureIds = score.measures.slice(index, last + 1).map((m) => m.id);
    const policyLabel = policy === "scale" ? "fit rhythm" : "keep durations";
    change.propose(
      { type: "setMeter", measureIds, meter: { numerator, denominator } as Meter, policy },
      `Bars ${index + 1}–${last + 1}: ${meter} · ${policyLabel}`,
    );
  };

  return (
    // Any edit to the form invalidates the current preview.
    <div onChange={change.discard}>
      <section>
        <h2>Time signature · bar {index + 1}</h2>
        <div className={styles.row}>
          <label>
            Through bar
            <BarRangeSelect
              score={score}
              startIndex={index}
              endIndex={last}
              onChange={setEndIndex}
              ariaLabel="Range end bar"
            />
          </label>
          <label>
            Time signature
            <select aria-label="Time signature" value={meter} onChange={(e) => setMeter(e.target.value)}>
              {METERS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Existing rhythm
          <select
            aria-label="Meter change policy"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as MeterPolicy)}
          >
            <option value="preserve">Keep note durations</option>
            <option value="scale">Fit rhythm proportionally</option>
          </select>
        </label>
        <p className={styles.hint}>{POLICY_HINTS[policy]} Later bars keep their meter.</p>
        <button onClick={previewMeterChange}>Preview meter change</button>
        <div className={styles.row}>
          <label>
            Tempo at this bar (♩ BPM)
            <input
              aria-label="Measure tempo"
              type="number"
              min={TEMPO_RANGE.min}
              max={TEMPO_RANGE.max}
              key={`${measure.id}-${measure.tempo}`}
              defaultValue={measure.tempo ?? ""}
              placeholder="Inherit"
              onBlur={(e) => {
                const tempo = e.target.value;
                if (!tempo) return;
                onCommand(
                  { type: "setTempo", measureId: measure.id, tempo: Number(tempo) },
                  `Tempo at bar ${index + 1}: ${tempo} BPM`,
                );
              }}
            />
          </label>
          {measure.tempo && (
            <button
              onClick={() => onCommand({ type: "removeTempo", measureId: measure.id }, "Removed local tempo change")}
            >
              Remove
            </button>
          )}
        </div>
      </section>
      <PendingChangePanel change={change} />
    </div>
  );
}
