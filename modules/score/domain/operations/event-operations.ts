import { locateEvent } from "../queries";
import { durationFromBeats, soundingBeats } from "../rhythm";
import { scoreKey } from "../key";
import { movePitch, staffPosition } from "../pitch";
import type { Pitch } from "../schema";
import { eventPitches, writeNotes } from "../stacks";
import { nextEvent, tieChain } from "../ties";
import { isNote, isRest, setBarStyle } from "../voice-access";
import { detachFrom, type Draft, type OperationContext } from "./draft";
import { makeRests, onsetOf } from "./rests";
import type { OperationOf } from "./schema";

/**
 * A pitch makes a note; `null` makes an explicit rest. Tied notes are one sound, so a new pitch
 * moves the whole chain; a rest breaks it (`applyCommand` drops the broken ties). A chord moves
 * as a whole: its other notes follow its lowest by the same steps, in the key.
 */
export function setPitch(draft: Draft, op: OperationOf<"setPitch">) {
  const ids = op.pitch ? tieChain(draft, op.eventId) : [op.eventId];
  for (const id of ids) {
    const { event } = locateEvent(draft, id);
    if (!op.pitch || !event.pitch) {
      writeEventNotes(draft, id, op.pitch && [op.pitch]);
      continue;
    }
    const steps = staffPosition(op.pitch) - staffPosition(event.pitch);
    const above = (event.stack ?? []).map((p) => movePitch(p, steps, scoreKey(draft)));
    writeEventNotes(draft, id, [op.pitch, ...above]);
  }
}

/** Several notes on one stem (a chord), or one; the whole tie chain takes them, as one sound. */
export function setNotes(draft: Draft, op: OperationOf<"setNotes">) {
  for (const id of tieChain(draft, op.eventId)) writeEventNotes(draft, id, op.pitches);
}

/** Removing a note leaves a rest of the same length, never shifting later notes. */
export function removeEvent(draft: Draft, op: OperationOf<"removeEvent">) {
  writeEventNotes(draft, op.eventId, null);
}

/** Gives an event its notes (one, or a chord), or makes it a rest with `null`. */
function writeEventNotes(draft: Draft, eventId: string, pitches: Pitch[] | null) {
  const { measure, event } = locateEvent(draft, eventId);
  if (pitches) writeNotes(event, pitches);
  else {
    event.pitch = null;
    delete event.stack;
    delete event.drums;
  }
  // Writing a note into a slash or repeat bar turns it back into a normal bar.
  if (isNote(event)) setBarStyle(measure, undefined);
  if (isNote(event)) delete event.measureRest;
  else delete event.articulation;
}

export function setArticulation(draft: Draft, op: OperationOf<"setArticulation">) {
  const { event } = locateEvent(draft, op.eventId);
  if (op.articulation) event.articulation = op.articulation;
  else delete event.articulation;
}

/**
 * Ties a note (or chord) into the next event, which takes its notes (a rest becomes the held
 * note). The last note of the score has nothing to tie to.
 */
export function setTie(draft: Draft, op: OperationOf<"setTie">) {
  const { event } = locateEvent(draft, op.eventId);
  if (!op.tied) {
    delete event.tie;
    return;
  }
  if (!event.pitch) throw new Error("Only a note can be tied; a rest has nothing to hold.");
  const next = nextEvent(draft, event.id);
  if (!next) throw new Error("The last note has nothing to tie to. Add a bar first.");
  writeEventNotes(draft, next.id, structuredClone(eventPitches(event)));
  event.tie = true;
}

/** Reorders within one voice of one measure; `beforeEventId: null` moves the event to the end. */
export function moveEvent(draft: Draft, op: OperationOf<"moveEvent">) {
  const from = locateEvent(draft, op.eventId);
  const to = op.beforeEventId ? locateEvent(draft, op.beforeEventId) : null;
  if (to && (from.measure.id !== to.measure.id || from.voiceId !== to.voiceId)) {
    throw new Error("Reordering currently stays within one measure and one voice.");
  }
  if (from.event.id === to?.event.id) return;
  const events = from.voiceBar.events;
  events.splice(from.eventIndex, 1);
  const index = to ? events.findIndex((e) => e.id === to.event.id) : events.length;
  events.splice(index, 0, from.event);
}

/**
 * Lengthening consumes only the rests directly after the note; it never overwrites notes.
 * Shortening fills the remainder with rests, so the bar stays complete and silent there.
 */
export function setDuration(draft: Draft, op: OperationOf<"setDuration">, { idPrefix }: OperationContext) {
  const { measure, voiceBar, eventIndex, event } = locateEvent(draft, op.eventId);
  const events = voiceBar.events;
  let available = soundingBeats(event);
  let consumed = 1;
  const restAfter = () => events[eventIndex + consumed] && isRest(events[eventIndex + consumed]);
  while (available < op.duration && restAfter()) {
    available += soundingBeats(events[eventIndex + consumed]);
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
  setBarStyle(measure, undefined);
  event.duration = durationFromBeats(op.duration);
  const restsStart = onsetOf(events, eventIndex) + op.duration;
  events.splice(eventIndex, consumed, event, ...makeRests(remainder, idPrefix, restsStart, measure.meter));
}
