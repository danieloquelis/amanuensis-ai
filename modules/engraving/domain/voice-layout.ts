import { durationNotation, isNote, type ScoreEvent } from "@/modules/score";
import type { AnalyzedEvent } from "./measure-analysis";
import { MIDDLE_LINE } from "./scene";

/**
 * Two (or more) voices on one staff, as engravers set them: odd voices stem up, even voices down;
 * rests move out of each other's way; noteheads a second apart sit side by side; accidentals in one
 * column stack leftwards. A bar with one voice is set as before.
 */

/** How far rests move off the middle line when voices share the staff, in staff steps. */
const REST_SHIFT = { short: 4, long: 2, lowWhole: 4 };
/** A notehead's width: how far a clashing head moves right. */
export const NOTEHEAD_WIDTH = 11;
/** Accidentals in one column step left by this much each. */
const ACCIDENTAL_STEP = 11;
const SAME_BEAT = 1e-6;

/** Whether a voice stems down when it shares the staff: voice 2 (and 4) do. */
export const stemsDown = (voice: number) => voice % 2 === 0;

/**
 * Where a rest sits. Alone on the staff, on the middle line. With other voices, voice 1's rests
 * go up and voice 2's down: a whole or half rest by a space, shorter rests by two; voice 2's
 * whole-bar rest hangs from the second line.
 */
export function restPosition(event: ScoreEvent, voice: number, polyphonic: boolean): number {
  if (!polyphonic) return MIDDLE_LINE;
  const long = event.measureRest || durationNotation(event.duration).base >= 2;
  if (!stemsDown(voice)) return MIDDLE_LINE + (long ? REST_SHIFT.long : REST_SHIFT.short);
  return MIDDLE_LINE - (long ? REST_SHIFT.lowWhole : REST_SHIFT.short);
}

/** Events of the bar that start together, by index. */
function sameOnsets(events: AnalyzedEvent[]): number[][] {
  const groups: number[][] = [];
  const order = events.map((_, i) => i).sort((a, b) => events[a].localBeat - events[b].localBeat);
  for (const index of order) {
    const last = groups.at(-1);
    if (last && Math.abs(events[last[0]].localBeat - events[index].localBeat) < SAME_BEAT) last.push(index);
    else groups.push([index]);
  }
  return groups;
}

/**
 * Side-by-side heads and stacked accidentals where voices start together. A lower voice's head
 * that is a second from, or above, an upper voice's head moves right; a unison of the same value
 * shares one head. Accidentals in the column are spread leftwards from the top.
 */
export function resolveCollisions(events: AnalyzedEvent[]) {
  for (const group of sameOnsets(events)) {
    const notes = group.map((i) => events[i]).filter((item) => isNote(item.event));
    const upper = notes.filter((item) => !stemsDown(item.voice));
    for (const lower of notes.filter((item) => stemsDown(item.voice))) {
      const clash = upper.some((u) => {
        const distance = u.position - lower.position;
        const sameHead =
          distance === 0 && durationNotation(u.event.duration).base === durationNotation(lower.event.duration).base;
        return !sameHead && distance <= 1;
      });
      if (clash) lower.xShift = NOTEHEAD_WIDTH;
    }
    notes
      .filter((item) => item.accidental !== null)
      .sort((a, b) => b.position - a.position)
      .forEach((item, k) => (item.accidentalShift = k * ACCIDENTAL_STEP));
  }
}
