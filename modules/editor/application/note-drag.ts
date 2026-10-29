import type { EngravedEvent } from "@/modules/engraving";
import { chordFrom, eventPitches, locateEvent, movePitch, scoreKey, type Pitch, type Score } from "@/modules/score";
import type { Edit } from "./note-edits";

/** Which note of a chord a press at scene height `y` grabbed: the nearest head (0 is the lowest). */
export function grabbedHead(item: Pick<EngravedEvent, "y" | "heads">, y: number): number {
  if (!item.heads) return 0;
  let nearest = 0;
  item.heads.forEach((head, k) => {
    if (Math.abs(head.y - y) < Math.abs(item.heads![nearest].y - y)) nearest = k;
  });
  return nearest;
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
 * A vertical drag on the sheet: a single note moves (with its tie chain); in a chord only the
 * grabbed note moves, the others stay. Null when nothing would change.
 */
export function noteDragEdit(score: Score, eventId: string, head: number, delta: number): Edit | null {
  const { event } = locateEvent(score, eventId);
  const notes = eventPitches(event);
  if (!delta || !notes.length) return null;
  if (notes.length === 1) {
    const pitch = movePitch(notes[0], delta, scoreKey(score));
    return { operation: { type: "setPitch", eventId, pitch }, receipt: "Moved note pitch" };
  }
  const pitches = withMovedNote(notes, head, delta, score);
  return pitches && { operation: { type: "setNotes", eventId, pitches }, receipt: "Moved a note of the chord" };
}
