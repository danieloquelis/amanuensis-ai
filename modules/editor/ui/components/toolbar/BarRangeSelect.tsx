import type { Score } from "@/modules/score";

/** Picks the last bar of a range starting at `startIndex`. Values are measure indexes. */
export function BarRangeSelect({
  score,
  startIndex,
  endIndex,
  onChange,
  ariaLabel,
}: {
  score: Score;
  startIndex: number;
  endIndex: number;
  onChange: (endIndex: number) => void;
  ariaLabel: string;
}) {
  return (
    <select aria-label={ariaLabel} value={endIndex} onChange={(e) => onChange(Number(e.target.value))}>
      {score.measures.slice(startIndex).map((measure, offset) => (
        <option key={measure.id} value={startIndex + offset}>
          {startIndex + offset + 1}
        </option>
      ))}
    </select>
  );
}

/** Clamps a chosen range end to `[startIndex, last bar]`. */
export const rangeEnd = (score: Score, startIndex: number, endIndex: number) =>
  Math.max(startIndex, Math.min(endIndex, score.measures.length - 1));
