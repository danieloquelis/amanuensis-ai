import {
  anchorIds,
  beats,
  measureCapacity,
  measureStarts,
  meterName,
  staffPosition,
  type Measure,
  type Score,
} from "@/modules/score";
import { beamBar } from "./beams";
import { DYNAMIC_ROW_HEIGHT, layoutLabels, textLineCount, TEXT_LINE_HEIGHT } from "./labels";
import {
  DEFAULT_MEASURE_WIDTH,
  MEASURES_PER_SYSTEM,
  positionY,
  SCENE_WIDTH,
  STEM_LENGTH,
  SYSTEM_HEIGHT,
  type BarScene,
  type EngravedEvent,
  type Scene,
  type System,
} from "./scene";

const FIRST_SYSTEM_TOP = 90;
const BARS_LEFT = 112;
const BARS_WIDTH = DEFAULT_MEASURE_WIDTH * MEASURES_PER_SYSTEM;
const NOTES_INSET = 28;
const TIME_SIGNATURE_WIDTH = 32;
const REPEAT_START_WIDTH = 12;
const NOTES_RIGHT_INSET = 34;
const BARLINE_INSET = 4;
const SCENE_BOTTOM_TRIM = 15;
/** Staff position of the bottom line (E4) on a treble staff. */
const BOTTOM_LINE = staffPosition({ step: "E", octave: 4, alter: 0 });
/** Middle line (B4); rests sit here and notes on or above it take down-stems. */
const MIDDLE_LINE = 4;
const TOP_LINE = 8;

/**
 * Derives the engraved scene from a score revision. Pure and deterministic: the same score
 * always produces the same geometry, so it can be cached by revision.
 */
export function layoutScore(score: Score): Scene {
  const systems: System[] = [];
  const starts = measureStarts(score);
  let nextTop = FIRST_SYSTEM_TOP;
  for (let first = 0; first < score.measures.length; first += MEASURES_PER_SYSTEM) {
    const measures = score.measures.slice(first, first + MEASURES_PER_SYSTEM);
    const anchors = anchorIds(measures);
    const annotations = score.annotations.filter((a) => anchors.has(a.targetId));
    const top = nextTop + textLineCount(annotations) * TEXT_LINE_HEIGHT;
    const system: System = { top, firstMeasure: first, bars: [], events: [], beams: [], beamedIds: [], labels: [] };
    measures.forEach((measure, index) => {
      const bar = layoutBar(score, first, index, starts[first + index]);
      system.bars.push(bar);
      system.events.push(...layoutEvents(measure, bar, top));
    });
    for (const bar of system.bars) beamBar(system, bar);
    const { dynamicRows } = layoutLabels(system, annotations);
    systems.push(system);
    nextTop = top + SYSTEM_HEIGHT + dynamicRows * DYNAMIC_ROW_HEIGHT;
  }
  return { width: SCENE_WIDTH, height: nextTop - SCENE_BOTTOM_TRIM, systems };
}

/** The first bar's width override sets the split; the second bar takes the rest. */
function layoutBar(score: Score, first: number, index: number, beat: number): BarScene {
  const measure = score.measures[first + index];
  const firstWidth = score.measures[first].width ?? DEFAULT_MEASURE_WIDTH;
  const width = index === 0 ? firstWidth : BARS_WIDTH - firstWidth;
  const x = index === 0 ? BARS_LEFT : BARS_LEFT + firstWidth;
  const showMeter = index === 0 || meterName(measure.meter) !== meterName(score.measures[first + index - 1].meter);
  const repeatStart = score.repeats.some((r) => r.startMeasureId === measure.id);
  const notesX =
    x + NOTES_INSET + (index > 0 && showMeter ? TIME_SIGNATURE_WIDTH : 0) + (repeatStart ? REPEAT_START_WIDTH : 0);
  const capacity = measureCapacity(measure.meter);
  return {
    x,
    endX: x + width - BARLINE_INSET,
    number: first + index + 1,
    id: measure.id,
    meter: measure.meter,
    showMeter,
    beat,
    capacity,
    notesX,
    unit: (x + width - NOTES_RIGHT_INSET - notesX) / capacity,
    repeatStart,
    repeatEnd: score.repeats.find((r) => r.endMeasureId === measure.id)?.count ?? null,
    tempo: measure.tempo,
  };
}

/** Places events proportionally to their onset; accidentals follow per-bar alteration state. */
function layoutEvents(measure: Measure, bar: BarScene, top: number): EngravedEvent[] {
  const accidentalState = new Map<string, number>();
  let onset = 0;
  return measure.events.map((event) => {
    const position = event.pitch ? staffPosition(event.pitch) - BOTTOM_LINE : MIDDLE_LINE;
    const y = positionY(top, position);
    const stemDown = position >= MIDDLE_LINE;
    let accidental: number | null = null;
    if (event.pitch) {
      const key = `${event.pitch.step}${event.pitch.octave}`;
      if ((accidentalState.get(key) ?? 0) !== event.pitch.alter) accidental = event.pitch.alter;
      accidentalState.set(key, event.pitch.alter);
    }
    const item: EngravedEvent = {
      event,
      x: event.measureRest ? (bar.x + bar.endX) / 2 : bar.notesX + onset * bar.unit,
      y,
      beat: bar.beat + onset,
      localBeat: onset,
      measure: bar.number - 1,
      stemDown,
      stemEnd: y + (stemDown ? STEM_LENGTH : -STEM_LENGTH),
      ledgerLines: ledgerLines(top, position),
      accidental,
    };
    onset += beats(event.duration);
    return item;
  });
}

/** Ledger line Ys for a position below the bottom line or above the top line. */
function ledgerLines(top: number, position: number): number[] {
  const lines: number[] = [];
  for (let line = -2; line >= position; line -= 2) lines.push(positionY(top, line));
  for (let line = TOP_LINE + 2; line <= position; line += 2) lines.push(positionY(top, line));
  return lines;
}
