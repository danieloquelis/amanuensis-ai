import {
  chordFrom,
  DRUM_PIECES,
  drumNames,
  eventPitches,
  locateEvent,
  pitchName,
  samePitch,
  type Score,
  type ScoreEvent,
  type Step,
} from "@/modules/score";
import { movedDrums } from "./drum-edits";
import { withMovedNote } from "./note-drag";
import { letterPitch, type Edit } from "./note-edits";

/**
 * One head of a stem picked on its own: a note of a chord, or a piece of a drum hit. Heads are
 * counted lowest first, as they are stored and drawn. Deleting one leaves the others; ↑/↓ and
 * letters change only it. The edits say where the head went, so it stays selected.
 */

/** How many heads a stem has: its notes, or its drum pieces (a rest has none). */
export const headCount = (event: ScoreEvent) => event.drums?.length ?? eventPitches(event).length;

/** The name of one head: "E4", "Snare". */
export function headName(event: ScoreEvent, head: number): string {
  if (event.drums) return drumNames([event.drums[head]]).replace(/^./, (c) => c.toUpperCase());
  const note = eventPitches(event)[head];
  return note ? pitchName(note) : "Rest";
}

/** Takes one head off a stem of several; null for a stem of one (deleting it makes a rest). */
export function removeHeadEdit(score: Score, eventId: string, head: number): Edit | null {
  const { event } = locateEvent(score, eventId);
  if (headCount(event) < 2) return null;
  const receipt = `Removed ${headName(event, head)}`;
  if (event.drums) {
    return { operation: { type: "setDrums", eventId, drums: event.drums.filter((_, k) => k !== head) }, receipt };
  }
  const pitches = eventPitches(event).filter((_, k) => k !== head);
  return { operation: { type: "setNotes", eventId, pitches }, receipt };
}

/** Where a head ends up among the stem's sorted notes once it is `pitch`. */
const indexOf = (pitches: ReturnType<typeof eventPitches>, pitch: ReturnType<typeof eventPitches>[number]) => {
  const { pitch: lowest, stack = [] } = chordFrom(pitches);
  return [lowest, ...stack].findIndex((p) => samePitch(p, pitch));
};

/** ↑/↓ on one head: a note a step in the key, a drum to the next piece; null where it cannot go. */
export function stepHeadEdit(score: Score, eventId: string, head: number, steps: number) {
  const { event } = locateEvent(score, eventId);
  if (event.drums) {
    const moved = movedDrums(score, eventId, head, steps);
    if (!moved) return null;
    const receipt = `Changed to ${DRUM_PIECES[moved.piece].name}`;
    return {
      edit: { operation: { type: "setDrums", eventId, drums: moved.drums }, receipt } as Edit,
      head: moved.drums.indexOf(moved.piece),
    };
  }
  const notes = eventPitches(event);
  const moved = notes.length > 1 ? withMovedNote(notes, head, steps, score) : null;
  if (!moved) return null;
  const receipt = `Changed ${pitchName(notes[head])} to ${pitchName(moved[head])}`;
  return {
    edit: { operation: { type: "setNotes", eventId, pitches: moved }, receipt } as Edit,
    head: indexOf(moved, moved[head]),
  };
}

/** A letter typed on one note of a chord replaces that note only; null when it would double another. */
export function letterHeadEdit(score: Score, eventId: string, head: number, step: Step) {
  const notes = eventPitches(locateEvent(score, eventId).event);
  if (notes.length < 2) return null;
  const pitch = letterPitch(score, eventId, step, { written: true, near: notes[head] });
  const pitches = notes.map((p, k) => (k === head ? pitch : p));
  try {
    const receipt = `Changed ${pitchName(notes[head])} to ${pitchName(pitch)}`;
    return {
      edit: { operation: { type: "setNotes", eventId, pitches }, receipt } as Edit,
      head: indexOf(pitches, pitch),
    };
  } catch {
    return null;
  }
}
