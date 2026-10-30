import { durationNotation, isNote, soundingBeats, type ScoreEvent } from "@/modules/score";
import type { AnalyzedEvent } from "./measure-analysis";
import { MIDDLE_LINE } from "./scene";

/**
 * Two (or more) voices on one staff, as engravers set them: odd voices stem up, even voices down;
 * rests move out of each other's way; noteheads a second apart sit side by side; accidentals in one
 * column stack leftwards. A bar with one voice is set as before.
 */

/** How far rests move off the middle line when voices share the staff, in staff steps. */
const REST_SHIFT = { short: 4, long: 2, lowWhole: 4 };
/** A rest in the other voice's way moves a staff space (two steps) at a time, staying on its line or space. */
const STAFF_SPACE = 2;
/** A notehead reaches a step above and below its position; a rest keeps another step clear of it. */
const HEAD_REACH = 1;
const REST_CLEARANCE = 1;
/** How far each rest's glyph reaches above and below its position, in staff steps (whole rests hang from their line). */
const REST_REACH = {
  whole: { up: 2, down: -1 },
  half: { up: 1, down: 0 },
  quarter: { up: 2.5, down: 3 },
  flagged: { up: 1.5, down: 2.5 },
};
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

/** Events of the bar that start together on one staff, by index. */
function sameOnsets(events: AnalyzedEvent[]): number[][] {
  const groups: number[][] = [];
  const order = events
    .map((_, i) => i)
    .sort((a, b) => events[a].staff - events[b].staff || events[a].localBeat - events[b].localBeat);
  for (const index of order) {
    const last = groups.at(-1);
    const same = last && events[last[0]].staff === events[index].staff;
    if (same && Math.abs(events[last[0]].localBeat - events[index].localBeat) < SAME_BEAT) last.push(index);
    else groups.push([index]);
  }
  return groups;
}

function restReach(event: ScoreEvent) {
  const value = event.measureRest ? 4 : durationNotation(event.duration).base;
  if (value >= 4) return REST_REACH.whole;
  if (value >= 2) return REST_REACH.half;
  return value >= 1 ? REST_REACH.quarter : REST_REACH.flagged;
}

const headsOf = (item: AnalyzedEvent) => (item.heads ? item.heads.map((h) => h.position) : [item.position]);

/** Whether a rest's glyph comes within `clearance` steps of any of the heads. */
function restMeets(rest: AnalyzedEvent, heads: number[], clearance: number): boolean {
  const reach = restReach(rest.event);
  const [top, bottom] = [rest.position + reach.up, rest.position - reach.down];
  return heads.some((head) => bottom < head + HEAD_REACH + clearance && top > head - HEAD_REACH - clearance);
}

/** The other voices' notes beside a rest: starting with it, or for a whole-bar rest (drawn mid-bar), sounding mid-bar. */
function notesBeside(events: AnalyzedEvent[], group: number[], rest: AnalyzedEvent): AnalyzedEvent[] {
  const middle = rest.localBeat + soundingBeats(rest.event) / 2;
  const candidates = rest.event.measureRest
    ? events.filter((e) => e.localBeat <= middle && middle < e.localBeat + soundingBeats(e.event))
    : group.map((i) => events[i]);
  return candidates.filter((e) => e.staff === rest.staff && e.voiceId !== rest.voiceId && isNote(e.event));
}

/**
 * Rests out of the other voice's way: a rest that would touch the other voices' notes beside it
 * moves a staff space at a time, an upper voice's rest up and a lower voice's down, until it is
 * clear. A whole-bar rest only has to avoid them; a shorter rest keeps a step between.
 */
function clearRests(events: AnalyzedEvent[], group: number[]) {
  for (const rest of group.map((i) => events[i]).filter((item) => item.shared && !isNote(item.event))) {
    const heads = notesBeside(events, group, rest).flatMap(headsOf);
    const clearance = rest.event.measureRest ? 0 : REST_CLEARANCE;
    const step = stemsDown(rest.voice) ? -STAFF_SPACE : STAFF_SPACE;
    while (heads.length && restMeets(rest, heads, clearance)) rest.position += step;
  }
}

/**
 * Side-by-side heads and stacked accidentals where voices start together. A lower voice's head
 * that is a second from, or above, an upper voice's head moves right; a unison of the same value
 * shares one head. Accidentals in the column are spread leftwards from the top. Rests move out
 * of the other voice's way.
 */
export function resolveCollisions(events: AnalyzedEvent[]) {
  for (const group of sameOnsets(events)) {
    clearRests(events, group);
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
