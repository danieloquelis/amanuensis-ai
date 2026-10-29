import { measureCapacity } from "./rhythm";
import type { Measure, Score, Staff } from "./schema";
import { allStaves, measureEvents, numberedVoice, voiceBars, voiceInfo } from "./voice-access";

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

/** "v2": voice 2 of the first staff, as score text names it. */
const VOICE_HANDLE = /^v(\d)$/;

/** A voice by ID or by handle ("v2"), resolved when the operation runs; throws when there is none. */
export function resolveVoice(score: Score, voiceId: string): string {
  if (voiceInfo(score, voiceId)) return voiceId;
  const handle = VOICE_HANDLE.exec(voiceId);
  const id = handle && numberedVoice(score, Number(handle[1]));
  if (!id) throw new Error(`There is no voice ${voiceId}; add it with addVoiceBars first.`);
  return id;
}

/** A staff by ID; the first staff when omitted. */
export function getStaff(score: Score, id?: string): Staff {
  const staves = allStaves(score);
  const staff = id === undefined ? staves[0] : staves.find((s) => s.id === id);
  if (!staff) throw new Error("That staff is not in the score.");
  return staff;
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
