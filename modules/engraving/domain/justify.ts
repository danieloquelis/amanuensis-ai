import type { AnalyzedBar } from "./measure-analysis";
import { barWidth, fixedWidth } from "./spacing";

const MAX_STRETCH = 64;
const ITERATIONS = 40;

/** Width of the bars as one line at stretch `s`; the first bar starts the line. */
export function lineWidth(bars: AnalyzedBar[], s: number): number {
  return bars.reduce((sum, bar, index) => {
    const atLineStart = index === 0;
    return sum + (fixedWidth(bar, atLineStart) ?? barWidth(bar, s, atLineStart));
  }, 0);
}

/**
 * Finds the stretch that makes `measure(s)` exactly `target`. `measure` must be non-decreasing.
 * Returns 0 when even the narrowest layout overflows.
 */
export function solveStretch(measure: (s: number) => number, target: number): number {
  if (measure(0) >= target) return 0;
  let low = 0;
  let high = 1;
  while (measure(high) < target && high < MAX_STRETCH) high *= 2;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (low + high) / 2;
    if (measure(mid) < target) low = mid;
    else high = mid;
  }
  return high;
}

/**
 * Stretch that justifies a line to `available`. When every bar has a fixed width there is nothing
 * to stretch: 1 if the line fits, 0 if it overflows.
 */
export function lineStretch(bars: AnalyzedBar[], available: number): number {
  const flexible = bars.some((bar, index) => fixedWidth(bar, index === 0) === null);
  if (flexible) return solveStretch((s) => lineWidth(bars, s), available);
  return lineWidth(bars, 1) <= available ? 1 : 0;
}
