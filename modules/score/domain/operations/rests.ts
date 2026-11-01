import { barMiddle, beatGroupLength, durationFromBeats, eventOnsets, measureCapacity, restValues } from "../rhythm";
import type { Meter, ScoreEvent } from "../schema";

/** Fallback when a position is off every beat grid (after dotted sixteenths, for example). */
const ANY_REST = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];

const isMultiple = (value: number, of: number) => Math.abs(value / of - Math.round(value / of)) < 1e-9;

/**
 * Whether a rest of `value` may start at `position` in a bar: rests shorter than a beat stay
 * inside their beat on their own grid; longer rests start on a beat and line up with their own
 * length (a half rest on beat 1 or 3 in 4/4), and none crosses the middle of the bar. A rest
 * filling the whole bar is always allowed.
 */
function fitsBeat(position: number, value: number, meter: Meter): boolean {
  const beat = beatGroupLength(meter);
  if (position === 0 && value === measureCapacity(meter)) return true;
  const middle = barMiddle(meter);
  if (middle !== null && position < middle - 1e-9 && position + value > middle + 1e-9) return false;
  if (value < beat) {
    const sameBeat = Math.floor(position / beat + 1e-9) === Math.floor((position + value) / beat - 1e-9);
    return sameBeat && isMultiple(position, value);
  }
  return isMultiple(position, beat) && isMultiple(position, value);
}

/**
 * Fills `duration` beats starting at `position` with rests a musician would write: complete the
 * current beat first, then whole beats, combining beats only where they line up.
 */
export function makeRests(duration: number, prefix: string, position: number, meter: Meter): ScoreEvent[] {
  // A whole-bar rest is a candidate when its value can be written (not 5/4, for example).
  const barRest = ANY_REST.filter((v) => v === measureCapacity(meter));
  const candidates = [...barRest, ...restValues(meter)];
  const rests: ScoreEvent[] = [];
  let at = position;
  let remaining = duration;
  while (remaining > 1e-9) {
    const value =
      candidates.find((v) => v <= remaining + 1e-9 && fitsBeat(at, v, meter)) ??
      ANY_REST.find((v) => v <= remaining + 1e-9);
    if (value === undefined) throw new Error("That duration cannot be notated yet.");
    rests.push({ id: `${prefix}-r${rests.length}`, pitch: null, duration: durationFromBeats(value) });
    at += value;
    remaining -= value;
  }
  return rests;
}

/** Beat at which the event at `index` starts within its voice bar. */
export const onsetOf = (events: ScoreEvent[], index: number): number => eventOnsets(events.slice(0, index + 1))[index];
