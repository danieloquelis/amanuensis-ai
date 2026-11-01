import { locateEvent } from "../queries";
import { beats, durationFromBeats, durationNotation } from "../rhythm";
import type { ScoreEvent } from "../schema";
import { groupOf, tupletSpan } from "../tuplets";
import { isRest, setBarStyle } from "../voice-access";
import { detachFrom, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/** The written values that split into a triplet: an eighth, a quarter or a half. */
const SPLITTABLE = [0.5, 1, 2];
const TRIPLET = { actual: 3, normal: 2 } as const;

/**
 * One value becomes three of half its written length in its time (a quarter → three triplet
 * eighths). The first keeps the event's ID, notes and articulation; the other two are rests.
 */
export function makeTuplet(draft: Draft, op: OperationOf<"makeTuplet">, { idPrefix }: OperationContext) {
  const { measure, voiceBar, eventIndex, event } = locateEvent(draft, op.eventId);
  if (event.tuplet) throw new Error("This note is already in a triplet.");
  const value = beats(event.duration);
  if (event.measureRest || durationNotation(event.duration).dotted || !SPLITTABLE.includes(value)) {
    throw new Error("A triplet splits an eighth, a quarter or a half without a dot.");
  }
  const tuplet = { id: `${idPrefix}-triplet`, ...TRIPLET };
  const written = durationFromBeats(value / 2);
  const rest = (k: number): ScoreEvent => ({ id: `${idPrefix}-t${k}`, duration: written, pitch: null, tuplet });
  const first: ScoreEvent = { ...event, duration: written, tuplet };
  // The tie would now lead into a rest; the triplet's first note no longer reaches the next note.
  delete first.tie;
  setBarStyle(measure, undefined);
  voiceBar.events.splice(eventIndex, 1, first, rest(1), rest(2));
}

/** A triplet collapses to one plain value of its length, keeping its first member's ID and notes. */
export function removeTuplet(draft: Draft, op: OperationOf<"removeTuplet">) {
  const { voiceBar } = locateEvent(draft, op.eventId);
  const group = groupOf(voiceBar.events, op.eventId);
  if (!group) throw new Error("This note is not in a triplet.");
  const [first, ...others] = group.events;
  const last = group.events.at(-1)!;
  const plain: ScoreEvent = { ...first, duration: durationFromBeats(tupletSpan(group)) };
  delete plain.tuplet;
  if (last.tie && first.pitch) plain.tie = true;
  else delete plain.tie;
  detachFrom(
    draft,
    others.map((event) => event.id),
  );
  voiceBar.events.splice(group.first, group.events.length, plain);
}

/** Plain written values that add up to `length`, longest first: what a triplet member's leftover time becomes. */
function plainValues(length: number): number[] {
  const values: number[] = [];
  for (const value of [2, 1, 0.5, 0.25]) {
    while (length >= value - 1e-9) {
      values.push(value);
      length -= value;
    }
  }
  return values;
}

/**
 * A triplet member's new written value, within its group: growing takes only the group's rests
 * after it, and leftover time becomes rests of the group, so the triplet keeps its span.
 */
export function setMemberDuration(draft: Draft, events: ScoreEvent[], index: number, duration: number, prefix: string) {
  const event = events[index];
  const group = groupOf(events, event.id)!;
  const end = group.first + group.events.length;
  let available = beats(event.duration);
  let consumed = 1;
  while (available < duration - 1e-9 && index + consumed < end && isRest(events[index + consumed])) {
    available += beats(events[index + consumed].duration);
    consumed++;
  }
  if (available < duration - 1e-9) {
    throw new Error(
      "Inside a triplet a note can only grow into the triplet's rests after it. Remove the triplet first.",
    );
  }
  detachFrom(
    draft,
    events.slice(index + 1, index + consumed).map((e) => e.id),
  );
  event.duration = durationFromBeats(duration);
  const rests = plainValues(available - duration).map((value, k): ScoreEvent => ({
    id: `${prefix}-r${k}`,
    duration: durationFromBeats(value),
    pitch: null,
    tuplet: event.tuplet,
  }));
  events.splice(index, consumed, event, ...rests);
}
