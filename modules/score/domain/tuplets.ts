import type { IdRegistry } from "./validation";
import {
  add,
  beats,
  beatGroupLength,
  durationNotation,
  eventOnsets,
  fraction,
  isSupportedDuration,
  soundingDuration,
} from "./rhythm";
import type { Meter, ScoreEvent } from "./schema";

/** A triplet fills one of these spans, in beats: a sixteenth, eighth or quarter-note triplet. */
export const TRIPLET_SPANS = [0.5, 1, 2] as const;

/** One triplet in a voice bar: its members, in order, and where they sit among the bar's events. */
export type TupletGroup = { id: string; first: number; events: ScoreEvent[] };

/** The triplets of a voice bar, in order. A group's members follow one another (validation checks it). */
export function tupletGroups(events: readonly ScoreEvent[]): TupletGroup[] {
  const groups: TupletGroup[] = [];
  events.forEach((event, index) => {
    if (!event.tuplet) return;
    const open = groups.at(-1);
    const continues = open && open.id === event.tuplet.id && open.first + open.events.length === index;
    if (continues) open.events.push(event);
    else groups.push({ id: event.tuplet.id, first: index, events: [event] });
  });
  return groups;
}

/** How long a group sounds, in beats: its written values in the time of two thirds. */
export const tupletSpan = (group: Pick<TupletGroup, "events">) =>
  beats(group.events.reduce((sum, event) => add(sum, soundingDuration(event)), fraction(0)));

/** The group of a voice bar that holds this event, if any. */
export const groupOf = (events: readonly ScoreEvent[], eventId: string) =>
  tupletGroups(events).find((group) => group.events.some((event) => event.id === eventId));

/**
 * Checks a voice bar's triplets: members in a row, undotted written values, three of them in the
 * time of two filling a sixteenth, eighth or quarter-note span from a beat (a sixteenth triplet
 * from a half beat too), in a simple meter. Registers each group's ID once.
 */
export function validateTuplets(events: readonly ScoreEvent[], meter: Meter, ids: IdRegistry) {
  const groups = tupletGroups(events);
  if (!groups.length) return;
  if (beatGroupLength(meter) !== 1) {
    throw new Error("Triplets are written in simple meters such as 2/4, 3/4 and 4/4, not in 2/2, 6/8, 9/8 or 12/8.");
  }
  const starts = eventOnsets(events);
  const seen = new Set<string>();
  for (const group of groups) {
    if (seen.has(group.id)) throw new Error("The notes of a triplet must follow one another in the bar.");
    seen.add(group.id);
    ids.add(group.id);
    for (const event of group.events) {
      const { dotted } = durationNotation(event.duration);
      if (event.measureRest || dotted || !isSupportedDuration(beats(event.duration))) {
        throw new Error("A triplet holds plain values: sixteenths, eighths, quarters or halves, without dots.");
      }
    }
    const span = tupletSpan(group);
    if (!(TRIPLET_SPANS as readonly number[]).includes(span)) {
      throw new Error(
        "A triplet fits three values into the time of two: three eighths (or a quarter and an eighth) in one beat, three sixteenths in half a beat, or three quarters in two beats.",
      );
    }
    if (starts[group.first] % Math.min(span, 1) !== 0) {
      throw new Error("A triplet starts on a beat (a sixteenth triplet may also start half a beat in).");
    }
  }
}

/**
 * Gives every triplet among copied events an ID of its own (`${prefix}-t0`, `-t1`…), keeping
 * members of one group together, so a copied bar never shares a group ID with its original.
 */
export function renameTuplets(events: readonly ScoreEvent[], prefix: string): void {
  const names = new Map<string, string>();
  for (const event of events) {
    if (!event.tuplet) continue;
    if (!names.has(event.tuplet.id)) names.set(event.tuplet.id, `${prefix}-t${names.size}`);
    event.tuplet = { ...event.tuplet, id: names.get(event.tuplet.id)! };
  }
}
