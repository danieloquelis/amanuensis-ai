import {
  DRUM_PIECE_CODES,
  DRUM_PIECES,
  drumNames,
  isDrumKit,
  locateEvent,
  MAX_DRUM_HITS,
  partOf,
  sortDrums,
  voiceNumber,
  type DrumPiece,
  type Operation,
  type Score,
  type ScoreEvent,
} from "@/modules/score";
import type { Edit } from "./note-edits";

/**
 * Editing a drum part by hand, like notes: a hit is dragged (or stepped with ↑/↓) through the kit
 * pieces of its voice, which change as it moves up and down the staff and sound as it passes them.
 * Hands (cymbals, snare, toms) are voice 1, feet (kick, hi-hat pedal) voice 2. A rest becomes a
 * snare or a kick; letters, which name pitches, do nothing here.
 */

export const isOnDrumPart = (score: Score, eventId: string) => isDrumKit(partOf(score, eventId).instrument);

/** The pieces the event's voice plays, low to high on the staff. */
export function voicePieces(score: Score, eventId: string): DrumPiece[] {
  const { voiceId } = locateEvent(score, eventId);
  const feet = voiceNumber(score, voiceId) === 2;
  return DRUM_PIECE_CODES.filter((piece) => (DRUM_PIECES[piece].voice === 2) === feet).sort(
    (a, b) => DRUM_PIECES[a].position - DRUM_PIECES[b].position,
  );
}

/** What a hit (or a rest) strikes, keeping its length; a whole-bar rest first shrinks to a quarter. */
function drumsOperation(event: ScoreEvent, drums: DrumPiece[] | null): Operation {
  const set: Operation = { type: "setDrums", eventId: event.id, drums };
  if (!drums || !event.measureRest) return set;
  return { type: "batch", operations: [{ type: "setDuration", eventId: event.id, duration: 1 }, set] };
}

/** A hit becomes a rest; a rest becomes the voice's main piece (snare for the hands, kick for the feet). */
export function drumRestEdit(score: Score, eventId: string): Edit {
  const { event } = locateEvent(score, eventId);
  if (event.drums) return { operation: drumsOperation(event, null), receipt: "Replaced hit with rest" };
  const piece: DrumPiece = voicePieces(score, eventId).includes("snare") ? "snare" : "kick";
  return { operation: drumsOperation(event, [piece]), receipt: `Added ${DRUM_PIECES[piece].name}` };
}

/**
 * The hit with one of its pieces (`head`, lowest first) moved `delta` rungs along its voice's
 * ladder of pieces: up the staff, with pieces on one line or space side by side (snare, then side
 * stick), so each step changes where or how the head is drawn. Null past either end, or onto a
 * piece the hit already strikes.
 */
export function movedDrums(score: Score, eventId: string, head: number, delta: number) {
  const { drums } = locateEvent(score, eventId).event;
  if (!drums) return null;
  const ladder = voicePieces(score, eventId);
  const from = drums[Math.min(head, drums.length - 1)];
  const piece = ladder[ladder.indexOf(from) + delta];
  if (!piece || (piece !== from && drums.includes(piece))) return null;
  return { drums: sortDrums(drums.map((p) => (p === from ? piece : p))), piece };
}

/** A vertical drag on a drum hit: the grabbed piece becomes the one it was dragged to. */
export function drumDragEdit(score: Score, eventId: string, head: number, delta: number): Edit | null {
  const moved = delta ? movedDrums(score, eventId, head, delta) : null;
  if (!moved) return null;
  return {
    operation: { type: "setDrums", eventId, drums: moved.drums },
    receipt: `Changed to ${drumNames(moved.drums)}`,
  };
}

/** ↑/↓ on a drum hit: its top piece takes the next rung up or down. */
export function stepDrumEdit(score: Score, eventId: string, steps: number): Edit | null {
  const { drums } = locateEvent(score, eventId).event;
  return drums ? drumDragEdit(score, eventId, drums.length - 1, Math.sign(steps)) : null;
}

/**
 * Another piece on the hit's stem, the one that usually goes with it: a snare under a cymbal (a
 * kick under a pedal hi-hat), a hi-hat over a drum (a pedal under a kick); with both already, the
 * next piece above the top one. Drag it to the piece wanted. Null when the stem is full.
 */
export function addDrumPieceEdit(score: Score, eventId: string): Edit | null {
  const { drums } = locateEvent(score, eventId).event;
  if (!drums || drums.length >= MAX_DRUM_HITS) return null;
  const ladder = voicePieces(score, eventId).filter((p) => !drums.includes(p));
  const isCymbal = (p: DrumPiece) => DRUM_PIECES[p].head === "x";
  const top = DRUM_PIECES[drums.at(-1)!].position;
  const partner = drums.some(isCymbal)
    ? ladder.find((p) => p === "snare" || p === "kick")
    : ladder.find((p) => p === "hat" || p === "hatfoot");
  const both = drums.some(isCymbal) && drums.some((p) => !isCymbal(p));
  const piece = both || !partner ? ladder.find((p) => DRUM_PIECES[p].position > top) : partner;
  if (!piece) return null;
  return {
    operation: { type: "setDrums", eventId, drums: sortDrums([...drums, piece]) },
    receipt: `Added ${DRUM_PIECES[piece].name}`,
  };
}
