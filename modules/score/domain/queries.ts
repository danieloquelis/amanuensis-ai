import { measureCapacity } from "./rhythm";
import type { Measure, Part, Score, Staff } from "./schema";
import { findPart, findStaff, findVoiceId } from "./handles";
import { allStaves, measureEvents, voiceBars } from "./voice-access";

/** Where an event is: its bar, its voice there, and its index within that voice bar. */
export function findEvent(score: Score, id: string) {
  for (let measureIndex = 0; measureIndex < score.measures.length; measureIndex++) {
    const measure = score.measures[measureIndex];
    for (const voiceBar of voiceBars(measure)) {
      const eventIndex = voiceBar.events.findIndex((event) => event.id === id);
      if (eventIndex !== -1) {
        const event = voiceBar.events[eventIndex];
        return { measure, measureIndex, voiceId: voiceBar.voiceId, voiceBar, eventIndex, event };
      }
    }
  }
  return null;
}

export function locateEvent(score: Score, id: string) {
  const location = findEvent(score, id);
  if (!location) throw new Error("That note is no longer in the score.");
  return location;
}

export function getMeasure(score: Score, id: string): Measure {
  const measure = score.measures.find((m) => m.id === id);
  if (!measure) throw new Error("That measure is no longer in the score.");
  return measure;
}

/**
 * A voice by ID or handle ("v2", "piano.2/v2", "trumpet"), resolved when the operation runs;
 * throws when there is none.
 */
export function resolveVoice(score: Score, voiceId: string): string {
  const id = findVoiceId(score, voiceId);
  if (!id) throw new Error(`There is no voice ${voiceId}; add it with addVoiceBars first.`);
  return id;
}

/** A staff by ID or handle ("piano.2"); the first staff when omitted. */
export function getStaff(score: Score, id?: string): Staff {
  const staff = id === undefined ? allStaves(score)[0] : findStaff(score, id);
  if (!staff) throw new Error(`There is no staff ${id}.`);
  return staff;
}

/** A part by ID or handle ("trumpet"); the first part when omitted. */
export function getPart(score: Score, id?: string): Part {
  const part = id === undefined ? score.parts[0] : findPart(score, id);
  if (!part) throw new Error(`There is no part ${id}.`);
  return part;
}

/** IDs that selections and indications may anchor to. */
export function anchorIds(measures: readonly Measure[]): Set<string> {
  return new Set(measures.flatMap((m) => [m.id, ...measureEvents(m).map((e) => e.id)]));
}

/** Absolute start beat of every measure, in score order. */
export function measureStarts(score: Score): number[] {
  let beat = 0;
  return score.measures.map((measure) => {
    const start = beat;
    beat += measureCapacity(measure.meter);
    return start;
  });
}
