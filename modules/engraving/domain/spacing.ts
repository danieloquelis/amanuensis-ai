import { beatGroupLength, durationNotation } from "@/modules/score";
import type { AnalyzedBar, AnalyzedEvent } from "./measure-analysis";

/**
 * Horizontal spacing model. Each event has a spring (ideal space to the next event, growing by a
 * factor of ~1.28 per doubling of duration, as in traditional engraving) and a minimum gap so
 * accidentals, dots and flags never collide. At stretch `s` a gap is `max(spring * s, minimum)`.
 */
const QUARTER_SPACE = 36;
const SPACE_EXPONENT = Math.log2(1.28);
const MEASURE_REST_SPACE = 60;
const MEASURE_REST_MIN = 36;
const SLASH_MIN = 18;
/** Clearance between neighbouring ink. */
const PADDING = 5;
export const BARLINE_PADDING = 10;
const BAR_LEFT_PADDING = 12;
export const INLINE_METER_WIDTH = 36;
export const REPEAT_START_WIDTH = 12;
/** At a line start the repeat sign follows the header instead of sharing the previous barline. */
export const LINE_START_REPEAT_INSET = 6;

const NOTEHEAD_HALF = 8;
const WHOLE_NOTEHEAD_HALF = 10;
const ACCIDENTAL_SPACE = 18;
const DOT_REACH = 17;
const FLAG_REACH_UP = 24;
const FLAG_REACH_DOWN = 14;
const REST_LEFT = 13;
const REST_RIGHT = 8;

export const springFor = (duration: number) => QUARTER_SPACE * duration ** SPACE_EXPONENT;

/** Ink to the left and right of an event's x. */
export function eventExtents(item: AnalyzedEvent): { left: number; right: number } {
  const { event } = item;
  const { base, dotted } = durationNotation(event.duration);
  if (!event.pitch) return { left: REST_LEFT, right: dotted ? DOT_REACH : REST_RIGHT };
  const head = base === 4 ? WHOLE_NOTEHEAD_HALF : NOTEHEAD_HALF;
  let right = dotted ? DOT_REACH : head;
  if (base <= 0.5 && item.beamGroup === null) right = Math.max(right, item.stemDown ? FLAG_REACH_DOWN : FLAG_REACH_UP);
  return { left: head + (item.accidental !== null ? ACCIDENTAL_SPACE : 0), right };
}

/** Centre of a time signature that changes mid-line, measured from the bar's left barline. */
export const inlineMeterOffset = (bar: AnalyzedBar, atLineStart: boolean) =>
  barLeadingSpace(bar, atLineStart) - INLINE_METER_WIDTH / 2 - 4;

/** Space between the left barline and the first event's ink. */
export function barLeadingSpace(bar: AnalyzedBar, atLineStart: boolean): number {
  const inlineMeter = bar.meterChanges && !atLineStart ? INLINE_METER_WIDTH : 0;
  const repeat = bar.repeatStart ? REPEAT_START_WIDTH + (atLineStart ? LINE_START_REPEAT_INSET : 0) : 0;
  return BAR_LEFT_PADDING + inlineMeter + repeat;
}

/** Gap after each event (to the next event, or to the closing barline) at stretch `s`. */
export function eventGaps(bar: AnalyzedBar, s: number): number[] {
  return bar.events.map((item, index) => {
    const next = bar.events[index + 1];
    const minimum = item.right + (next ? next.left + PADDING : BARLINE_PADDING);
    return Math.max(item.spring * s, minimum);
  });
}

/** Total bar width at stretch `s`. `s = 0` gives the narrowest collision-free width. */
export function barWidth(bar: AnalyzedBar, s: number, atLineStart: boolean): number {
  const leading = barLeadingSpace(bar, atLineStart);
  if (bar.style === "slashes") {
    const beat = beatGroupLength(bar.measure.meter);
    const count = slashCount(bar);
    return leading + Math.max(count * springFor(beat) * s, count * SLASH_MIN);
  }
  if (bar.measureRest) return leading + Math.max(MEASURE_REST_SPACE * s, MEASURE_REST_MIN);
  return leading + bar.events[0].left + eventGaps(bar, s).reduce((sum, gap) => sum + gap, 0);
}

/** One rhythm slash per beat (a dotted quarter in compound time). */
export const slashCount = (bar: AnalyzedBar) => Math.round(bar.capacity / beatGroupLength(bar.measure.meter));

/** A user width override, never narrower than the content needs; null when the bar is flexible. */
export function fixedWidth(bar: AnalyzedBar, atLineStart: boolean): number | null {
  const override = bar.measure.width;
  return override === undefined ? null : Math.max(override, barWidth(bar, 0, atLineStart));
}
