import { locateEvent } from "../queries";
import { beats, durationFromBeats } from "../rhythm";
import type { Pitch } from "../schema";
import { detachFrom, type Draft, type OperationContext } from "./draft";
import { makeRests, onsetOf } from "./rests";
import type { OperationOf } from "./schema";

/** A pitch makes a note; `null` makes an explicit rest. */
export function setPitch(draft: Draft, op: OperationOf<"setPitch">) {
  writePitch(draft, op.eventId, op.pitch);
}

/** Removing a note leaves a rest of the same length, never shifting later notes. */
export function removeEvent(draft: Draft, op: OperationOf<"removeEvent">) {
  writePitch(draft, op.eventId, null);
}

function writePitch(draft: Draft, eventId: string, pitch: Pitch | null) {
  const { measure, event } = locateEvent(draft, eventId);
  event.pitch = pitch;
  // Writing a note into a slash or repeat bar turns it back into a normal bar.
  if (event.pitch) delete measure.style;
  if (event.pitch) delete event.measureRest;
  else delete event.articulation;
}

export function setArticulation(draft: Draft, op: OperationOf<"setArticulation">) {
  const { event } = locateEvent(draft, op.eventId);
  if (op.articulation) event.articulation = op.articulation;
  else delete event.articulation;
}

/** Reorders within one measure; `beforeEventId: null` moves the event to the end. */
export function moveEvent(draft: Draft, op: OperationOf<"moveEvent">) {
  const from = locateEvent(draft, op.eventId);
  const to = op.beforeEventId ? locateEvent(draft, op.beforeEventId) : null;
  if (to && from.measure.id !== to.measure.id) {
    throw new Error("Reordering currently stays within one measure.");
  }
  if (from.event.id === to?.event.id) return;
  const events = from.measure.events;
  events.splice(from.eventIndex, 1);
  const index = to ? events.findIndex((e) => e.id === to.event.id) : events.length;
  events.splice(index, 0, from.event);
}

/**
 * Lengthening consumes only the rests directly after the note; it never overwrites notes.
 * Shortening fills the remainder with rests, so the bar stays complete and silent there.
 */
export function setDuration(draft: Draft, op: OperationOf<"setDuration">, { idPrefix }: OperationContext) {
  const { measure, eventIndex, event } = locateEvent(draft, op.eventId);
  const events = measure.events;
  let available = beats(event.duration);
  let consumed = 1;
  while (available < op.duration && events[eventIndex + consumed]?.pitch === null) {
    available += beats(events[eventIndex + consumed].duration);
    consumed++;
  }
  if (available < op.duration) {
    throw new Error("Make space first: a longer note can only use rests immediately after it.");
  }
  const remainder = available - op.duration;
  detachFrom(
    draft,
    events.slice(eventIndex + 1, eventIndex + consumed).map((e) => e.id),
  );
  delete event.measureRest;
  delete measure.style;
  event.duration = durationFromBeats(op.duration);
  const restsStart = onsetOf(measure, eventIndex) + op.duration;
  events.splice(eventIndex, consumed, event, ...makeRests(remainder, idPrefix, restsStart, measure.meter));
}
