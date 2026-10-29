import type { Pitch, Score, ScoreEvent } from "./schema";

/**
 * A tie joins a note to the next event in score order, across a barline too, into one sound.
 * `event.tie` marks the first note of each tied pair; both notes always have the same pitch.
 */

export const samePitch = (a: Pitch | null, b: Pitch | null) =>
  !!a && !!b && a.step === b.step && a.alter === b.alter && a.octave === b.octave;

/** Every event in score order. */
const allEvents = (score: Score): ScoreEvent[] => score.measures.flatMap((m) => m.events);

/** The event after `eventId` in score order, in the next bar if it is the last in its bar. */
export function nextEvent(score: Score, eventId: string): ScoreEvent | null {
  const events = allEvents(score);
  const index = events.findIndex((e) => e.id === eventId);
  return index === -1 ? null : (events[index + 1] ?? null);
}

/** IDs of the notes sounding as one with `eventId`, first to last; just itself when untied. */
export function tieChain(score: Score, eventId: string): string[] {
  const events = allEvents(score);
  let first = events.findIndex((e) => e.id === eventId);
  if (first === -1) return [];
  while (first > 0 && events[first - 1].tie) first--;
  let last = first;
  while (events[last].tie && last + 1 < events.length) last++;
  return events.slice(first, last + 1).map((e) => e.id);
}

/** Pairs of tied event IDs, `[from, to]`, in score order. */
export function tiePairs(score: Score): [string, string][] {
  const events = allEvents(score);
  return events.flatMap((event, i) => (event.tie && events[i + 1] ? [[event.id, events[i + 1].id]] : []));
}

/** Whether the tie on `events[index]` joins two notes of the same pitch. */
const holds = (events: ScoreEvent[], index: number) => samePitch(events[index].pitch, events[index + 1]?.pitch ?? null);

/**
 * Drops ties an edit has broken: the note became a rest, or the next event is now a rest, a
 * different pitch or missing. Runs once after a whole command, so a batch may rewrite both sides.
 */
export function pruneTies(score: Score) {
  const events = allEvents(score);
  events.forEach((event, index) => {
    if (event.tie && !holds(events, index)) delete event.tie;
  });
}

/** Throws when a stored tie does not join two notes of the same pitch. */
export function validateTies(score: Score) {
  const events = allEvents(score);
  events.forEach((event, index) => {
    if (event.tie && !holds(events, index)) {
      throw new Error("A tie must join a note to a next note of the same pitch.");
    }
  });
}
