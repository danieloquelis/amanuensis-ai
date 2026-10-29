import type { Score, ScoreEvent } from "./schema";
import { sharesNote } from "./stacks";
import { barEvents, voiceIds, voiceOf } from "./voice-access";

/**
 * A tie joins a note to the next event of its voice, across a barline too (when that voice plays
 * in the next bar), into one sound.
 * `event.tie` marks the first note of each tied pair; the two share at least one note (a chord
 * holds the notes the next chord repeats).
 */

/** A voice's runs of consecutive bars it plays in: a tie never jumps a bar where the voice is silent. */
function runsOf(score: Score, voiceId: string): ScoreEvent[][] {
  const runs: ScoreEvent[][] = [[]];
  for (const measure of score.measures) {
    const events = barEvents(measure, voiceId);
    if (events.length) runs.at(-1)!.push(...events);
    else if (runs.at(-1)!.length) runs.push([]);
  }
  return runs.filter((run) => run.length);
}

/** Every run of every voice. */
const lines = (score: Score): ScoreEvent[][] => voiceIds(score).flatMap((voiceId) => runsOf(score, voiceId));

/** The run of bars `eventId` is in, within its voice. */
function lineOf(score: Score, eventId: string): ScoreEvent[] {
  const voiceId = voiceOf(score, eventId);
  return (voiceId && runsOf(score, voiceId).find((run) => run.some((e) => e.id === eventId))) || [];
}

/** The event after `eventId` in its voice, in the next bar if it is the last in its bar. */
export function nextEvent(score: Score, eventId: string): ScoreEvent | null {
  const events = lineOf(score, eventId);
  const index = events.findIndex((e) => e.id === eventId);
  return index === -1 ? null : (events[index + 1] ?? null);
}

/** IDs of the notes sounding as one with `eventId`, first to last; just itself when untied. */
export function tieChain(score: Score, eventId: string): string[] {
  const events = lineOf(score, eventId);
  let first = events.findIndex((e) => e.id === eventId);
  if (first === -1) return [];
  while (first > 0 && events[first - 1].tie) first--;
  let last = first;
  while (events[last].tie && last + 1 < events.length) last++;
  return events.slice(first, last + 1).map((e) => e.id);
}

/** Pairs of tied event IDs, `[from, to]`, voice by voice. */
export function tiePairs(score: Score): [string, string][] {
  return lines(score).flatMap((events) =>
    events.flatMap((event, i): [string, string][] =>
      event.tie && events[i + 1] ? [[event.id, events[i + 1].id]] : [],
    ),
  );
}

/** Whether the tie on `events[index]` holds a note into the next event: they share one. */
const holds = (events: ScoreEvent[], index: number) =>
  !!events[index + 1] && sharesNote(events[index], events[index + 1]);

/**
 * Drops ties an edit has broken: the note became a rest, or the next event is now a rest, a
 * different pitch or missing. Runs once after a whole command, so a batch may rewrite both sides.
 */
export function pruneTies(score: Score) {
  for (const events of lines(score))
    events.forEach((event, index) => {
      if (event.tie && !holds(events, index)) delete event.tie;
    });
}

/** Throws when a stored tie does not join two notes of the same pitch. */
export function validateTies(score: Score) {
  for (const events of lines(score))
    events.forEach((event, index) => {
      if (event.tie && !holds(events, index)) {
        throw new Error("A tie must join a note to a next note of the same pitch.");
      }
    });
}
