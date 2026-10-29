import type { AnalyzedEvent } from "./measure-analysis";
import { springFor } from "./spacing";

/**
 * The events of every voice that start on the same beat share one x: a column. Its ink reaches as
 * far as its widest event, and its spring is the time to the next column (or the bar's end). With
 * one voice a column is one event, spaced exactly as before.
 */
export type Column = { beat: number; events: number[]; left: number; right: number; spring: number };

/** Onsets closer than this are the same beat (exact for every value but tuplets). */
const SAME_BEAT = 1e-6;

export function onsetColumns(events: AnalyzedEvent[], capacity: number): Column[] {
  const columns: Column[] = [];
  const byOnset = events.map((item, index) => ({ item, index })).sort((a, b) => a.item.localBeat - b.item.localBeat);
  for (const { item, index } of byOnset) {
    const last = columns.at(-1);
    // A head moved right beside another voice's widens the column on the right.
    const left = item.left - item.xShift;
    const right = item.right + item.xShift;
    if (last && Math.abs(last.beat - item.localBeat) < SAME_BEAT) {
      last.events.push(index);
      last.left = Math.max(last.left, left);
      last.right = Math.max(last.right, right);
    } else {
      columns.push({ beat: item.localBeat, events: [index], left, right, spring: 0 });
    }
  }
  columns.forEach((column, i) => (column.spring = springFor((columns[i + 1]?.beat ?? capacity) - column.beat)));
  return columns;
}
