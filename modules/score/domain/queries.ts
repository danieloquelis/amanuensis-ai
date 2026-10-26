import { measureCapacity } from "./rhythm";
import type { Measure, Score } from "./schema";

export function findEvent(score: Score, id: string) {
  for (let measureIndex = 0; measureIndex < score.measures.length; measureIndex++) {
    const measure = score.measures[measureIndex];
    const eventIndex = measure.events.findIndex((event) => event.id === id);
    if (eventIndex !== -1) {
      return { measure, measureIndex, eventIndex, event: measure.events[eventIndex] };
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

/** IDs that selections and indications may anchor to. */
export function anchorIds(measures: readonly Measure[]): Set<string> {
  return new Set(measures.flatMap((m) => [m.id, ...m.events.map((e) => e.id)]));
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
