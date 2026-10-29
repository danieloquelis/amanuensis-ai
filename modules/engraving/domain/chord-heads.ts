import type { AnalyzedEvent } from "./measure-analysis";
import { ACCIDENTAL_SPACE } from "./spacing";
import { NOTEHEAD_WIDTH } from "./voice-layout";

/**
 * Several notes on one stem, set as engravers do: heads on the stem's usual side, except that
 * of two notes a second apart one moves across the stem (the upper with an up-stem, the lower
 * with a down-stem); accidentals stack in columns leftwards, top first, so none touch.
 */

/** One head of a chord: its staff position, accidental, and how far it and its accidental move. */
export type ChordHead = { position: number; accidental: number | null; dx: number; accidentalShift: number };

/** Accidentals closer than this (in staff steps) would touch, so they take separate columns. */
const ACCIDENTAL_REACH = 6;
const ACCIDENTAL_COLUMN = 11;

/** Every head position of an event, lowest first: its chord's, or its single note's. */
export const headPositions = (item: AnalyzedEvent) =>
  item.heads ? item.heads.map((h) => h.position) : [item.position];

/** Sides of the stem: a head a second from the previous one (from the stem's end) crosses over. */
function headOffsets(positions: number[], stemDown: boolean): number[] {
  const order = positions.map((_, i) => i);
  if (stemDown) order.reverse();
  const dx = positions.map(() => 0);
  let previous: number | null = null;
  for (const i of order) {
    const crosses = previous !== null && Math.abs(positions[i] - positions[previous]) === 1 && dx[previous] === 0;
    dx[i] = crosses ? (stemDown ? -NOTEHEAD_WIDTH : NOTEHEAD_WIDTH) : 0;
    previous = i;
  }
  return dx;
}

/** Columns for accidentals, top first: each takes the nearest column where it touches none. */
function accidentalColumns(heads: ChordHead[]): void {
  const columns: number[][] = [];
  for (const head of [...heads].sort((a, b) => b.position - a.position)) {
    if (head.accidental === null) continue;
    let column = columns.findIndex((placed) => placed.every((p) => Math.abs(p - head.position) >= ACCIDENTAL_REACH));
    if (column === -1) column = columns.push([]) - 1;
    columns[column].push(head.position);
    head.accidentalShift = column * ACCIDENTAL_COLUMN + Math.max(0, -Math.min(...heads.map((h) => h.dx)));
  }
}

/**
 * Lays out a chord once its stem direction is known, and widens its ink to match: heads moved
 * right of the stem reach further right; accidental columns and heads moved left, further left.
 */
export function layoutChord(item: AnalyzedEvent) {
  if (!item.heads) return;
  const dx = headOffsets(
    item.heads.map((h) => h.position),
    item.stemDown,
  );
  item.heads.forEach((head, i) => (head.dx = dx[i]));
  accidentalColumns(item.heads);
  const widestShift = Math.max(...item.heads.map((h) => h.accidentalShift));
  const hasAccidental = item.heads.some((h) => h.accidental !== null);
  item.left += hasAccidental ? ACCIDENTAL_SPACE + widestShift : Math.max(0, -Math.min(...dx));
  item.right += Math.max(0, ...dx);
}
