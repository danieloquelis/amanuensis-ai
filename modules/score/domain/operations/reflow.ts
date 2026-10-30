import { durationFromBeats, measureCapacity, soundingBeats } from "../rhythm";
import { spellRhythm } from "../rhythm-spelling";
import type { Measure, Meter, ScoreEvent } from "../schema";
import { barEvents, isNote } from "../voice-access";
import { fullMeasureRest } from "./draft";
import { makeRests } from "./rests";

// Music laid out in time and poured back into bars: how time is inserted, removed or stretched
// across barlines. Rests are the gaps between notes; they are written afresh.

/** A note, chord or drum hit placed in a line's time: from `at` (quarter beats from the first bar) for `length`. */
export type Placed = { event: ScoreEvent; at: number; length: number };

const EPSILON = 1e-9;

/** A line's notes in `measures`, end to end in time; the IDs of its rests (which reflowing replaces). */
export function lineNotes(measures: Measure[], voiceId: string): { notes: Placed[]; rests: string[] } {
  const notes: Placed[] = [];
  const rests: string[] = [];
  let offset = 0;
  for (const measure of measures) {
    let at = offset;
    for (const event of barEvents(measure, voiceId)) {
      const length = event.measureRest ? measureCapacity(measure.meter) : soundingBeats(event);
      if (isNote(event)) notes.push({ event, at, length });
      else rests.push(event.id);
      at += length;
    }
    offset += measureCapacity(measure.meter);
  }
  return { notes, rests };
}

/** `length` beats of silence at `at`: notes after it move later; a note sounding across it is split there. */
export function insertTime(notes: Placed[], at: number, length: number, newId: (k: number) => string): Placed[] {
  return notes.flatMap((note, k): Placed[] => {
    if (note.at >= at - EPSILON) return [{ ...note, at: note.at + length }];
    const end = note.at + note.length;
    if (end <= at + EPSILON) return [note];
    const tail = { ...note.event, id: newId(k) };
    delete tail.articulation;
    return [
      { event: { ...note.event, tie: undefined }, at: note.at, length: at - note.at },
      { event: tail, at: at + length, length: end - at },
    ];
  });
}

/** `length` beats taken out at `at`: notes inside go, a note across the cut gets shorter, later notes move earlier. */
export function removeTime(notes: Placed[], at: number, length: number): { kept: Placed[]; removed: string[] } {
  const cut = at + length;
  const removed: string[] = [];
  const kept = notes.flatMap((note): Placed[] => {
    const end = note.at + note.length;
    if (end <= at + EPSILON) return [note];
    if (note.at >= cut - EPSILON) return [{ ...note, at: note.at - length }];
    const before = Math.max(0, at - note.at);
    const after = Math.max(0, end - cut);
    if (before + after <= EPSILON) {
      removed.push(note.event.id);
      return [];
    }
    return [{ ...note, at: Math.min(note.at, at), length: before + after }];
  });
  return { kept, removed };
}

/** Notes starting in [`from`, `to`) scaled by `factor` from `from`; notes after it move by the change. */
export function stretchTime(notes: Placed[], from: number, to: number, factor: number): Placed[] {
  return notes.map((note) => {
    if (note.at < from - EPSILON) return note;
    if (note.at >= to - EPSILON) return { ...note, at: note.at + (to - from) * (factor - 1) };
    return { ...note, at: from + (note.at - from) * factor, length: note.length * factor };
  });
}

/**
 * The notes written back into bars of `meters`: in each bar, the notes sounding in it, each part
 * spelled at its place (split across barlines and beats with ties, a drum hit's rest after it),
 * and rests between. A note's first part keeps its ID (and what is anchored to it).
 */
export function barsOf(notes: Placed[], meters: Meter[], prefix: string): ScoreEvent[][] {
  let start = 0;
  return meters.map((meter, bar) => {
    const end = start + measureCapacity(meter);
    const events: ScoreEvent[] = [];
    let cursor = start;
    const rest = (until: number) => {
      if (until > cursor + EPSILON)
        events.push(...makeRests(until - cursor, `${prefix}-b${bar}-${events.length}`, cursor - start, meter));
      cursor = until;
    };
    for (const note of notes) {
      const from = Math.max(note.at, start);
      const to = Math.min(note.at + note.length, end);
      if (to <= from + EPSILON) continue;
      rest(from);
      const parts = spellRhythm(from - start, to - from, meter, false);
      parts.forEach((value, k) => {
        const first = Math.abs(from - note.at) < EPSILON && k === 0;
        const last = Math.abs(to - (note.at + note.length)) < EPSILON && k === parts.length - 1;
        const silent = Boolean(note.event.drums) && !first;
        const event: ScoreEvent = silent
          ? { id: `${prefix}-b${bar}-${events.length}`, pitch: null, duration: durationFromBeats(value) }
          : {
              ...note.event,
              id: first ? note.event.id : `${prefix}-b${bar}-${events.length}`,
              duration: durationFromBeats(value),
            };
        if (!first) delete event.articulation;
        if (!silent && !last && !note.event.drums) event.tie = true;
        else if (!silent && last && note.event.tie) event.tie = true;
        else delete event.tie;
        events.push(event);
      });
      cursor = to;
    }
    if (!events.length) {
      start = end;
      return fullMeasureRest(meter, `${prefix}-b${bar}`);
    }
    rest(end);
    start = end;
    return events;
  });
}
