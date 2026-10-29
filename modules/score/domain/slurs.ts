import type { IdRegistry } from "./validation";
import type { Score, Slur } from "./schema";

/**
 * A slur groups the notes from its start to its end note, in score order and across barlines,
 * into one legato phrase: sung on one breath, or one syllable over several notes. Slurs never
 * overlap; a new one replaces any it would overlap.
 */

const eventOrder = (score: Score): string[] => score.measures.flatMap((m) => m.events.map((e) => e.id));

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
  const order = eventOrder(score);
  const span = spanOf(order, { startEventId: firstId, endEventId: lastId });
  if (!span) throw new Error("That note is no longer in the score.");
  const events = score.measures.flatMap((m) => m.events);
  const ids = order.slice(Math.min(...span), Math.max(...span) + 1);
  const notes = ids.filter((id) => events.find((e) => e.id === id)!.pitch);
  if (notes.length < 2) throw new Error("A slur joins at least two notes.");
  return { startEventId: notes[0], endEventId: notes.at(-1)! };
}

/** Whether two spans share any event. */
const overlaps = (a: [number, number], b: [number, number]) => a[0] <= b[1] && b[0] <= a[1];

/** Slurs that would overlap a new slur from `startEventId` to `endEventId`. */
export function overlappingSlurs(score: Score, ends: Pick<Slur, "startEventId" | "endEventId">): Slur[] {
  const order = eventOrder(score);
  const span = spanOf(order, ends);
  if (!span) return [];
  return score.slurs.filter((slur) => {
    const other = spanOf(order, slur);
    return other !== null && overlaps(span, other);
  });
}

/** IDs of the notes a slur makes legato into the next: every slurred note but the last. */
export function legatoIds(score: Score): Set<string> {
  const order = eventOrder(score);
  const ids = new Set<string>();
  for (const slur of score.slurs) {
    const span = spanOf(order, slur);
    if (span) order.slice(span[0], span[1]).forEach((id) => ids.add(id));
  }
  return ids;
}

/** Drops slurs an edit has broken: an end note was removed, or the ends are no longer in order. */
export function pruneSlurs(score: Score) {
  const order = eventOrder(score);
  score.slurs = score.slurs.filter((slur) => {
    const span = spanOf(order, slur);
    return span !== null && span[0] < span[1];
  });
}

export function validateSlurs(score: Score, ids: IdRegistry) {
  const order = eventOrder(score);
  const spans: [number, number][] = [];
  for (const slur of score.slurs) {
    ids.add(slur.id);
    const span = spanOf(order, slur);
    if (!span || span[0] >= span[1]) throw new Error("A slur must run forward between two notes in the score.");
    if (spans.some((other) => overlaps(span, other))) throw new Error("Slurs may not overlap.");
    spans.push(span);
  }
}
