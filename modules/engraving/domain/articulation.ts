import { durationNotation, isNote } from "@/modules/score";
import { STAFF_HEIGHT, type EngravedEvent } from "./scene";

/** Articulations sit this far from the notehead, and at least this far outside the staff. */
const ARTICULATION_GAP = 18;
const ARTICULATION_CLEARANCE = 12;
/** Past a stem's tip (or its beam), where voices share the staff. */
const BEYOND_STEM = 10;
/** How far a mark's ink reaches either way from its centre. */
export const ARTICULATION_HALF_HEIGHT = 6;

/**
 * Where an articulation's centre goes. Alone on the staff, above the note and outside the staff.
 * Where voices share it (always on a drum staff), on the voice's own side, past the stem's tip, so
 * the stem never runs through it: above the hands' up-stems, below the feet's down-stems.
 */
export function articulationPlace(item: EngravedEvent, staffTop: number): { y: number; below: boolean } {
  const stemmed = isNote(item.event) && durationNotation(item.event.duration).base < 4;
  if (item.curveSide === "below") {
    const from = stemmed && item.stemDown ? item.stemEnd + BEYOND_STEM : item.y + ARTICULATION_GAP;
    return { y: Math.max(from, staffTop + STAFF_HEIGHT + ARTICULATION_CLEARANCE), below: true };
  }
  const from = item.curveSide && stemmed && !item.stemDown ? item.stemEnd - BEYOND_STEM : item.y - ARTICULATION_GAP;
  return { y: Math.min(from, staffTop - ARTICULATION_CLEARANCE), below: false };
}
