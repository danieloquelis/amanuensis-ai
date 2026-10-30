import { measureCapacity, meterName } from "../domain/rhythm";
import { SCORE_LIMITS, type Meter } from "../domain/schema";
import type { WrittenBar } from "./score-text-parse";

// Checks on written bar lines before they are applied, with messages that say exactly what to fix.

/** Beats closer than this are equal (sums of written values are exact in binary but for rounding). */
const SAME_BEATS = 1e-9;

/**
 * Every line must fill its bar. All lines that don't are named at once, each with its count, so
 * they can be fixed in one go.
 */
export function checkFills(bars: WrittenBar[], meterOf: (bar: number) => Meter): void {
  const off = bars.flatMap((line) => {
    if (!line.events) return [];
    const meter = meterOf(line.bar);
    const total = line.events.reduce((sum, event) => sum + event.duration, 0);
    const capacity = measureCapacity(meter);
    if (Math.abs(total - capacity) < SAME_BEATS) return [];
    const name = `bar ${line.bar}${line.staff ? ` ${line.staff}` : ""}${line.voice > 1 ? ` v${line.voice}` : ""}`;
    return [`${name} has ${total} of ${capacity} (${meterName(meter)})`];
  });
  if (!off.length) return;
  throw new Error(`Each line must fill its bar, counted in quarter-note beats: ${off.join("; ")}.`);
}

/** No line may write past the last bar a score can hold. */
export function checkLength(bars: WrittenBar[]): void {
  const last = Math.max(...bars.map((line) => line.bar));
  if (last <= SCORE_LIMITS.measures) return;
  throw new Error(
    `A score holds at most ${SCORE_LIMITS.measures} bars: bar ${last} is past its end. Write only up to bar ${SCORE_LIMITS.measures}.`,
  );
}
