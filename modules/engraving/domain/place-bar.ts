import { isNote } from "@/modules/score";
import { solveStretch } from "./justify";
import { stemsDown } from "./voice-layout";
import type { AnalyzedBar, AnalyzedEvent } from "./measure-analysis";
import { MIDDLE_LINE, positionY, STEM_LENGTH, type BarScene, type BeatColumn, type EngravedEvent } from "./scene";
import {
  BARLINE_PADDING,
  barLeadingSpace,
  barWidth,
  columnGaps,
  inlineMeterOffset,
  LINE_START_REPEAT_INSET,
  slashCount,
} from "./spacing";

/** Mid-line, a start-repeat's thick line sits just left of the shared barline. */
const REPEAT_THICK_OFFSET = -5;

const TOP_LINE = 8;

type BarPlacement = {
  x: number;
  width: number;
  top: number;
  atLineStart: boolean;
  /** Time signature centre in the system header, used when the bar starts the line. */
  headerMeterX: number;
  final: boolean;
};

/**
 * Places one bar's events inside `width`, spreading them with the same spring model used for
 * justification. Beamed stems are finalized later by `beamBar`.
 */
export function placeBar(bar: AnalyzedBar, placement: BarPlacement): { scene: BarScene; events: EngravedEvent[] } {
  const { x, width, top, atLineStart } = placement;
  const endX = x + width;
  const contentStart = x + barLeadingSpace(bar, atLineStart);
  const columnXs = bar.measureRest
    ? [(contentStart + endX) / 2]
    : columnPositions(bar, contentStart, width, atLineStart);
  const xs = eventXs(bar, columnXs, (contentStart + endX) / 2);
  const events = bar.events.map((item, index) => engrave(item, xs[index], bar, top));
  const notesX = bar.measureRest ? contentStart : columnXs[0];
  const slashXs = bar.style === "slashes" ? evenlySpaced(slashCount(bar), contentStart, endX - BARLINE_PADDING) : [];
  const scene: BarScene = {
    id: bar.measure.id,
    number: bar.index + 1,
    x,
    endX,
    width,
    meter: bar.measure.meter,
    meterX: bar.meterChanges ? (atLineStart ? placement.headerMeterX : x + inlineMeterOffset(bar, atLineStart)) : null,
    beat: bar.beat,
    capacity: bar.capacity,
    notesX,
    columns: beatColumns(bar, events, notesX, endX, slashXs),
    repeatStartX: bar.repeatStart ? x + (atLineStart ? LINE_START_REPEAT_INSET : REPEAT_THICK_OFFSET) : null,
    repeatEnd: bar.repeatEnd,
    tempo: bar.measure.tempo,
    final: placement.final,
    style: bar.style,
    slashXs,
    section: bar.measure.section ?? null,
    marks: bar.marks,
    repeatStartId: bar.repeatStartId,
    repeatEndId: bar.repeatEndId,
  };
  return { scene, events };
}

function columnPositions(bar: AnalyzedBar, contentStart: number, width: number, atLineStart: boolean): number[] {
  const stretch = solveStretch((s) => barWidth(bar, s, atLineStart), width);
  const gaps = columnGaps(bar, stretch);
  let cursor = contentStart + bar.columns[0].left;
  return gaps.map((gap) => {
    const x = cursor;
    cursor += gap;
    return x;
  });
}

/**
 * Each event at its column's x (a whole-bar rest's bar has one column). A voice resting for the
 * whole bar beside another voice has its rest centred in the bar.
 */
function eventXs(bar: AnalyzedBar, columnXs: number[], centre: number): number[] {
  const xs: number[] = [];
  bar.columns.forEach((column, c) => column.events.forEach((index) => (xs[index] = columnXs[c] ?? columnXs[0])));
  bar.events.forEach((item, index) => {
    if (bar.polyphonic && item.event.measureRest) xs[index] = centre;
  });
  return xs;
}

function engrave(item: AnalyzedEvent, columnX: number, bar: AnalyzedBar, top: number): EngravedEvent {
  const x = columnX + item.xShift;
  const y = positionY(top, item.position);
  const middleY = positionY(top, MIDDLE_LINE);
  // Stems reach at least the middle line, so notes on ledger lines don't get stubby stems.
  const stemEnd = item.stemDown ? Math.max(y + STEM_LENGTH, middleY) : Math.min(y - STEM_LENGTH, middleY);
  return {
    event: item.event,
    voice: item.voice,
    x,
    y,
    beat: bar.beat + item.localBeat,
    localBeat: item.localBeat,
    measure: bar.index,
    stemDown: item.stemDown,
    stemEnd,
    ledgerLines: isNote(item.event) ? ledgerLines(top, item.position) : [],
    accidental: item.accidental,
    ...(item.accidentalShift ? { accidentalShift: item.accidentalShift } : {}),
    ...(bar.polyphonic ? { curveSide: stemsDown(item.voice) ? ("below" as const) : ("above" as const) } : {}),
    left: x - item.left,
    right: x + item.right,
    hidden: bar.style !== null,
  };
}

/** `count` centres spread evenly between `from` and `to`. */
function evenlySpaced(count: number, from: number, to: number): number[] {
  const step = (to - from) / count;
  return Array.from({ length: count }, (_, i) => from + step * (i + 0.5));
}

/** Ledger line Ys for a position below the bottom line or above the top line. */
function ledgerLines(top: number, position: number): number[] {
  const lines: number[] = [];
  for (let line = -2; line >= position; line -= 2) lines.push(positionY(top, line));
  for (let line = TOP_LINE + 2; line <= position; line += 2) lines.push(positionY(top, line));
  return lines;
}

/** Onset positions plus the bar end, so the playhead moves at the music's pace, not linearly. */
function beatColumns(
  bar: AnalyzedBar,
  events: EngravedEvent[],
  notesX: number,
  endX: number,
  slashXs: number[],
): BeatColumn[] {
  const end = { beat: bar.beat + bar.capacity, x: endX - BARLINE_PADDING };
  if (slashXs.length) {
    const beatLength = bar.capacity / slashXs.length;
    return [...slashXs.map((x, i) => ({ beat: bar.beat + i * beatLength, x })), end];
  }
  if (bar.measureRest) return [{ beat: bar.beat, x: notesX }, end];
  const byBeat = bar.columns.map((column) => events[column.events[0]]);
  return [...byBeat.map((e) => ({ beat: e.beat, x: e.x })), end];
}
