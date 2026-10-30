import { beatGroupLength, isCompound, measureCapacity } from "./rhythm";
import type { Meter } from "./schema";

/** Values a note can be written as, in quarter-note beats, longest first. */
const WRITABLE = [6, 4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];
/** The finest position a written value can start on (a dotted sixteenth leaves thirty-seconds). */
const FINEST = 0.125;
const EIGHTH = 0.5;
const SIXTEENTH = 0.25;
const EPSILON = 1e-9;
/** How strong a point in the bar is; `quarter` is a quarter inside a half-note beat (2/2). */
const WEIGHT = { bar: 4, half: 3, beat: 2, quarter: 1.5, eighth: 1, sixteenth: 0, finer: -1 };
const QUARTER = 1;

const on = (position: number, unit: number) => Math.abs(position / unit - Math.round(position / unit)) < EPSILON;
const writable = (length: number) => WRITABLE.some((value) => Math.abs(value - length) < EPSILON);

/**
 * How strong a point in the bar is: the bar line, the middle of a bar of four beats (4/4, 12/8),
 * a beat (a quarter, a dotted quarter in 6/8, 9/8, 12/8, a half in 2/2), a quarter within a half
 * beat, an eighth, a sixteenth, or finer (a point no value needs to show).
 */
export function metricWeight(position: number, meter: Meter): number {
  const capacity = measureCapacity(meter);
  const beat = beatGroupLength(meter);
  const beatsInBar = Math.round(capacity / beat);
  if (on(position, capacity)) return WEIGHT.bar;
  if (beatsInBar === 4 && on(position, capacity / 2)) return WEIGHT.half;
  if (on(position, beat)) return WEIGHT.beat;
  if (beat > QUARTER && !isCompound(meter) && on(position, QUARTER)) return WEIGHT.quarter;
  if (on(position, EIGHTH)) return WEIGHT.eighth;
  return on(position, SIXTEENTH) ? WEIGHT.sixteenth : WEIGHT.finer;
}

/** The strongest point strictly inside (start, end), the latest of equals; null if none. */
function strongestInside(start: number, end: number, meter: Meter): { at: number; weight: number } | null {
  let best: { at: number; weight: number } | null = null;
  for (let at = (Math.floor(start / FINEST + EPSILON) + 1) * FINEST; at < end - EPSILON; at += FINEST) {
    const weight = metricWeight(at, meter);
    if (!best || weight >= best.weight) best = { at, weight };
  }
  return best;
}

/**
 * Whether one written value from `start` to `end` reads clearly: it hides no point in the bar
 * stronger than both where it starts and where it ends ("show the beat", as engravers say).
 * Familiar syncopations in simple meters are allowed through: a quarter on the off-beat (e q e),
 * a dotted quarter from the off-beat onto a beat (q. q. q), a value of up to two quarters
 * starting on a beat (q h q, q q. e q), and in cut time a half from the second quarter of a beat
 * (q h q across the middle of a 2/2 bar). Rests are
 * stricter: they never cross the middle of the bar, and never a beat they do not start on.
 */
function readsClearly(start: number, end: number, meter: Meter, rest: boolean): boolean {
  const crossed = strongestInside(start, end, meter)?.weight ?? WEIGHT.finer;
  const from = metricWeight(start, meter);
  if (rest) {
    const wholeBar = from === WEIGHT.bar && on(end, measureCapacity(meter));
    return wholeBar || (crossed < from && crossed < WEIGHT.half);
  }
  if (crossed <= Math.max(from, metricWeight(end, meter))) return true;
  if (isCompound(meter) || crossed >= WEIGHT.bar) return false;
  const length = end - start;
  const halfOffBeat = from === WEIGHT.quarter && Math.abs(length - 2) < EPSILON;
  const offBeatQuarter = from === WEIGHT.eighth && Math.abs(length - 1) < EPSILON;
  const offBeatDotted =
    from === WEIGHT.eighth && Math.abs(length - 1.5) < EPSILON && metricWeight(end, meter) >= WEIGHT.beat;
  const fromBeat = from >= WEIGHT.beat && length <= 2 + EPSILON;
  return offBeatQuarter || offBeatDotted || fromBeat || halfOffBeat;
}

/** Longest writable values first: the fallback when there is no point in the bar to split at. */
function greedy(length: number): number[] {
  const parts: number[] = [];
  let remaining = length;
  while (remaining > EPSILON) {
    const value = WRITABLE.find((v) => v <= remaining + EPSILON) ?? remaining;
    parts.push(value);
    remaining -= value;
  }
  return parts;
}

/**
 * How a note (or rest) sounding from `start` for `length` beats within one bar is written, as
 * values to tie together, the way a musician would: one value when it reads clearly, otherwise
 * split at the strongest point it hides, and each part again. `e h q.` reads as `e q.~ e q.`.
 */
export function spellRhythm(start: number, length: number, meter: Meter, rest = false): number[] {
  const end = start + length;
  if (writable(length) && readsClearly(start, end, meter, rest)) return [length];
  const split = strongestInside(start, end, meter);
  if (!split) return greedy(length);
  const parts = [
    ...spellRhythm(start, split.at - start, meter, rest),
    ...spellRhythm(split.at, end - split.at, meter, rest),
  ];
  // Never a value that cannot be written (a thirty-second): then the plainest writing that can be.
  if (parts.every(writable)) return parts;
  return writable(length) ? [length] : greedy(length);
}
