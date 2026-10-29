import {
  eventPitches,
  inKey,
  locateEvent,
  MAX_CHORD_NOTES,
  midiPitch,
  movePitch,
  partOf,
  pitchName,
  scoreKey,
  toConcert,
  toWritten,
  transpositionOf,
  writtenKey,
  type Pitch,
  type Score,
  type Step,
} from "@/modules/score";
import { letterNoteEdit, type Edit } from "./note-edits";

/**
 * Shift + a letter on a note: that letter joins it on the same stem, the nearest such note above
 * its top note (spelled in the key), making a chord. On a rest it just writes the note, like the
 * letter alone. As with plain letters, a transposing part's letter names the written note.
 */
export function addToChordEdit(score: Score, eventId: string, step: Step, { written = true } = {}): Edit {
  const { event } = locateEvent(score, eventId);
  const notes = eventPitches(event);
  if (!notes.length) return letterNoteEdit(score, eventId, step, { written });
  if (notes.length >= MAX_CHORD_NOTES) throw new Error(`One stem holds at most ${MAX_CHORD_NOTES} notes.`);
  const concertKey = scoreKey(score);
  const t = written ? transpositionOf(partOf(score, eventId).instrument) : null;
  const shown = (p: Pitch) => (t ? toWritten(p, t, concertKey) : p);
  const key = t ? writtenKey(concertKey, t) : concertKey;
  const top = shown(notes.at(-1)!);
  // The first octave of this letter that sits above the chord's top note.
  let added = inKey({ step, alter: 0, octave: top.octave }, key);
  if (midiPitch(added) <= midiPitch(top)) added = { ...added, octave: added.octave + 1 };
  const sounding = t ? toConcert(added, t, concertKey) : added;
  return {
    operation: { type: "setNotes", eventId, pitches: [...notes, sounding] },
    receipt: `Added ${pitchName(sounding)} to the chord`,
  };
}

/** A typed letter, on the sheet as shown (written pitch): with Shift it joins the chord, otherwise it replaces the note. */
export const typedLetterEdit = (score: Score, eventId: string, step: Step, addToChord: boolean): Edit =>
  addToChord ? addToChordEdit(score, eventId, step) : letterNoteEdit(score, eventId, step, { written: true });

/** A third above the chord's top note (or the note's), in the key: the next note a chord stacks. */
const THIRD_STEPS = 2;

/** Adds the note a third above the top of a note or chord, on the same stem; null when the stem is full. */
export function addChordNoteEdit(score: Score, eventId: string): Edit | null {
  const notes = eventPitches(locateEvent(score, eventId).event);
  if (!notes.length || notes.length >= MAX_CHORD_NOTES) return null;
  const added = movePitch(notes.at(-1)!, THIRD_STEPS, scoreKey(score));
  return {
    operation: { type: "setNotes", eventId, pitches: [...notes, added] },
    receipt: `Added ${pitchName(added)} to the chord`,
  };
}

/** Takes the top note off a chord; null for a single note or a rest. */
export function removeTopNoteEdit(score: Score, eventId: string): Edit | null {
  const notes = eventPitches(locateEvent(score, eventId).event);
  if (notes.length < 2) return null;
  return {
    operation: { type: "setNotes", eventId, pitches: notes.slice(0, -1) },
    receipt: `Removed ${pitchName(notes.at(-1)!)} from the chord`,
  };
}
