import type { AnalyzedBar } from "./measure-analysis";
import { lineStretch } from "./justify";

export type Line = { start: number; end: number; stretch: number };

const MAX_BARS_PER_LINE = 8;
/** Lines may compress slightly below natural spacing before a break is forced. */
const MIN_STRETCH = 0.85;
const COMPRESSION_PENALTY = 3;

/** Squared distance from natural spacing; compression costs more than stretching. */
function lineCost(stretch: number): number {
  const deviation = stretch >= 1 ? stretch - 1 : COMPRESSION_PENALTY * (1 - stretch);
  return deviation * deviation;
}

/**
 * Chooses line breaks that keep spacing as even as possible across all lines (a small
 * Knuth–Plass style search), so four short bars become one line, and seven become 4 + 3 rather
 * than 6 + 1. `available(start)` is the width a line starting at bar `start` can use.
 */
export function breakLines(bars: AnalyzedBar[], available: (start: number) => number): Line[] {
  const best: { cost: number; start: number; stretch: number }[] = [{ cost: 0, start: 0, stretch: 1 }];
  for (let end = 1; end <= bars.length; end++) {
    best[end] = { cost: Infinity, start: end - 1, stretch: 1 };
    for (let start = end - 1; start >= Math.max(0, end - MAX_BARS_PER_LINE); start--) {
      const stretch = lineStretch(bars.slice(start, end), available(start));
      const single = end - start === 1;
      // More bars only compress further, so stop once a line is too tight.
      if (!single && stretch < MIN_STRETCH) break;
      const cost = best[start].cost + lineCost(stretch);
      if (cost < best[end].cost) best[end] = { cost, start, stretch };
    }
  }
  const lines: Line[] = [];
  for (let end = bars.length; end > 0; end = best[end].start) {
    lines.unshift({ start: best[end].start, end, stretch: best[end].stretch });
  }
  return lines;
}
