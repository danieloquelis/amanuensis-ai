import type { IdRegistry } from "./validation";
import type { Score, Slur } from "./schema";
import { isNote, voiceLine, voiceOf } from "./voice-access";

/**
 * A slur groups the notes of one voice from its start to its end note, across barlines, into one
 * legato phrase: sung on one breath, or one syllable over several notes. Slurs never overlap; a
 * new one replaces any it would overlap.
 */

/** The voice `eventId` is in, as event IDs bar by bar. A slur's ends are both in this order. */
const eventOrder = (score: Score, eventId: string): string[] => voiceLine(score, eventId).map((e) => e.id);

/** Index range of a slur in score order, or null when an endpoint is gone. */
function spanOf(order: string[], slur: Pick<Slur, "startEventId" | "endEventId">): [number, number] | null {
  const start = order.indexOf(slur.startEventId);
  const end = order.indexOf(slur.endEventId);
  return start === -1 || end === -1 ? null : [start, end];
}

/**
 * The notes a slur over `firstId`…`lastId` (either order) joins: rests at either end are left
 * out, rests inside stay. Throws unless at least two notes remain.
 */
export function slurEnds(score: Score, firstId: string, lastId: string): { startEventId: string; endEventId: string } {
  const order = eventOrder(score, firstId);
  const span = spanOf(order, { startEventId: firstId, endEventId: lastId });
  if (!span) throw new Error("That note is no longer in the score, or is in another voice.");
  const events = voiceLine(score, firstId);
  const ids = order.slice(Math.min(...span), Math.max(...span) + 1);
  const notes = ids.filter((id) => isNote(events.find((e) => e.id === id)!));
  if (notes.length < 2) throw new Error("A slur joins at least two notes.");
  return { startEventId: notes[0], endEventId: notes.at(-1)! };
}

/** Whether two spans share any event. */
const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];

/** Slurs that would overlap a new slur from `startEventId` to `endEventId`. */
export function overlappingSlurs(score: Score, ends: Pick<Slur, "startEventId" | "endEventId">): Slur[] {
  const order = eventOrder(score, ends.startEventId);
  const span = spanOf(order, ends);
  if (!span) return [];
  return score.slurs.filter((slur) => {
    const other = spanOf(order, slur);
    return other !== null && overlaps(span, other);
  });
}

/** IDs of the notes a slur makes legato into the next: every slurred note but the last. */
export function legatoIds(score: Score): Set<string> {
  const ids = new Set<string>();
  for (const slur of score.slurs) {
    const order = eventOrder(score, slur.startEventId);
    const span = spanOf(order, slur);
    if (span) order.slice(span[0], span[1]).forEach((id) => ids.add(id));
  }
  return ids;
}

/** Drops slurs an edit has broken: an end note was removed, or the ends are no longer in order. */
export function pruneSlurs(score: Score) {
  score.slurs = score.slurs.filter((slur) => {
    const span = spanOf(eventOrder(score, slur.startEventId), slur);
    return span !== null && span[0] < span[1];
  });
}

export function validateSlurs(score: Score, ids: IdRegistry) {
  const spans: { voiceId: string | null; span: [number, number] }[] = [];
  for (const slur of score.slurs) {
    ids.add(slur.id);
    const voiceId = voiceOf(score, slur.startEventId);
    const span = spanOf(eventOrder(score, slur.startEventId), slur);
    if (!span || span[0] >= span[1]) throw new Error("A slur must run forward between two notes of one voice.");
    if (spans.some((other) => other.voiceId === voiceId && overlaps(span, other.span))) {
      throw new Error("Slurs may not overlap.");
    }
    spans.push({ voiceId, span });
  }
}
