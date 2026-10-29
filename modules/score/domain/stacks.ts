import { midiPitch, samePitch } from "./pitch";
import type { Pitch, ScoreEvent } from "./schema";

/**
 * Several notes on one stem (a chord within a voice: a piano chord, a guitar double stop). An
 * event's `pitch` is its lowest note; `stack` holds the others, strictly higher, lowest first.
 * Code that reads only `pitch` keeps seeing a note; code about the sound reads every pitch.
 */

/** At most this many notes on one stem. */
export const MAX_CHORD_NOTES = 6;

/** Every note of an event, lowest first; none for a rest. */
export const eventPitches = (event: Pick<ScoreEvent, "pitch" | "stack">): Pitch[] =>
  event.pitch ? [event.pitch, ...(event.stack ?? [])] : [];

/** The same notes, spelled the same, in the same order. */
export const sameNotes = (a: Pick<ScoreEvent, "pitch" | "stack">, b: Pick<ScoreEvent, "pitch" | "stack">) => {
  const [x, y] = [eventPitches(a), eventPitches(b)];
  return x.length > 0 && x.length === y.length && x.every((pitch, i) => samePitch(pitch, y[i]));
};

/** Whether two events share at least one note: what a tie between them holds. */
export const sharesNote = (a: Pick<ScoreEvent, "pitch" | "stack">, b: Pick<ScoreEvent, "pitch" | "stack">) =>
  eventPitches(a).some((p) => eventPitches(b).some((q) => samePitch(p, q)));

/** Notes as stored: sorted low to high, the lowest as `pitch` and the rest as `stack` (absent for one note). */
export function chordFrom(pitches: Pitch[]): { pitch: Pitch; stack?: Pitch[] } {
  if (!pitches.length) throw new Error("A chord needs at least one note.");
  if (pitches.length > MAX_CHORD_NOTES) throw new Error(`One stem holds at most ${MAX_CHORD_NOTES} notes.`);
  const sorted = [...pitches].sort((a, b) => midiPitch(a) - midiPitch(b));
  if (sorted.some((p, i) => i > 0 && midiPitch(p) === midiPitch(sorted[i - 1]))) {
    throw new Error("A chord cannot hold the same note twice.");
  }
  const [pitch, ...stack] = sorted;
  return stack.length ? { pitch, stack } : { pitch };
}

/** Writes notes into an event: one pitch is a plain note, several a chord. */
export function writeNotes(event: ScoreEvent, pitches: Pitch[]) {
  const { pitch, stack } = chordFrom(pitches);
  event.pitch = pitch;
  if (stack) event.stack = stack;
  else delete event.stack;
}

/** Throws unless a stored stack is valid: on a note, strictly rising above its pitch, within the limit. */
export function validateStack(event: ScoreEvent) {
  if (!event.stack) return;
  if (!event.pitch) throw new Error("A rest cannot hold notes on a stem.");
  const notes = eventPitches(event);
  if (notes.length > MAX_CHORD_NOTES) throw new Error(`One stem holds at most ${MAX_CHORD_NOTES} notes.`);
  if (notes.some((p, i) => i > 0 && midiPitch(p) <= midiPitch(notes[i - 1]))) {
    throw new Error("The notes on a stem must rise from the lowest, each one different.");
  }
}
