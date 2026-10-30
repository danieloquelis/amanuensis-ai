import type { EngravedEvent } from "@/modules/engraving";
import {
  chordFrom,
  DRUM_PIECES,
  eventPitches,
  locateEvent,
  midiPitch,
  movePitch,
  scoreKey,
  type Pitch,
  type Score,
} from "@/modules/score";
import { drumDragEdit, movedDrums } from "./drum-edits";
import { canDragTo, type Edit } from "./note-edits";

/** Which note of a chord a press at scene height `y` grabbed: the nearest head (0 is the lowest). */
export function grabbedHead(item: Pick<EngravedEvent, "y" | "heads">, y: number): number {
  if (!item.heads) return 0;
  let nearest = 0;
  item.heads.forEach((head, k) => {
    if (Math.abs(head.y - y) < Math.abs(item.heads![nearest].y - y)) nearest = k;
  });
  return nearest;
}

/** How close to a head's centre (scene units) a press picks that head rather than the whole stem. */
const HEAD_REACH = 8;

/** The head of a stem of several that a press at height `y` lands on, or null (a single head, or the stem). */
export function pressedHead(item: Pick<EngravedEvent, "y" | "heads">, y: number): number | null {
  if (!item.heads) return null;
  const head = grabbedHead(item, y);
  return Math.abs(item.heads[head].y - y) <= HEAD_REACH ? head : null;
}

/**
 * The event's notes with one of them moved by `delta` staff steps in the key; null when it would
 * land on another note of the chord.
 */
export function withMovedNote(notes: Pitch[], head: number, delta: number, score: Score): Pitch[] | null {
  const moved = notes.map((pitch, k) => (k === head ? movePitch(pitch, delta, scoreKey(score)) : pitch));
  try {
    chordFrom(moved);
    return moved;
  } catch {
    return null;
  }
}

/**
 * What a vertical drag of `delta` steps would sound, as a MIDI note, or null when it cannot go
 * there: the grabbed note (`pitch`, as it sounds) moved in the key, or the drum piece the grabbed
 * head of a hit has reached.
 */
export function draggedSound(score: Score, eventId: string, head: number, delta: number, pitch: Pitch | null) {
  if (locateEvent(score, eventId).event.drums) {
    const moved = movedDrums(score, eventId, head, delta);
    return moved && DRUM_PIECES[moved.piece].midi;
  }
  if (!pitch) return null;
  const moved = movePitch(pitch, delta, scoreKey(score));
  return canDragTo(score, eventId, moved) ? midiPitch(moved) : null;
}

/**
 * A vertical drag on the sheet: a single note moves (with its tie chain); in a chord only the
 * grabbed note moves, the others stay; a drum hit's grabbed piece steps through the kit. Null when
 * nothing would change.
 */
export function noteDragEdit(score: Score, eventId: string, head: number, delta: number): Edit | null {
  const { event } = locateEvent(score, eventId);
  if (event.drums) return drumDragEdit(score, eventId, head, delta);
  const notes = eventPitches(event);
  if (!delta || !notes.length) return null;
  if (notes.length === 1) {
    const pitch = movePitch(notes[0], delta, scoreKey(score));
    return { operation: { type: "setPitch", eventId, pitch }, receipt: "Moved note pitch" };
  }
  const pitches = withMovedNote(notes, head, delta, score);
  return pitches && { operation: { type: "setNotes", eventId, pitches }, receipt: "Moved a note of the chord" };
}
