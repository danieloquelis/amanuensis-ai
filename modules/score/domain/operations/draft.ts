import { durationFromBeats, measureCapacity } from "../rhythm";
import type { Meter, Score, ScoreEvent } from "../schema";

/**
 * Operation handlers mutate a cloned draft of the score. `applyCommand` owns cloning,
 * revision checks and final validation, so a failed handler never leaks a partial edit.
 */
export type Draft = Score;

/** Deterministic, request-scoped prefix for IDs created by one operation. */
export type OperationContext = { idPrefix: string };

const REST_VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];

/** Fills a duration with the fewest written rests, longest first. */
export function makeRests(duration: number, prefix: string): ScoreEvent[] {
  const rests: ScoreEvent[] = [];
  for (const value of REST_VALUES) {
    while (duration >= value) {
      rests.push({ id: `${prefix}-r${rests.length}`, pitch: null, duration: durationFromBeats(value) });
      duration -= value;
    }
  }
  if (duration !== 0) throw new Error("That duration cannot be notated yet.");
  return rests;
}

/** Like `makeRests`, but marked as unfinished editable space. */
export function makeGaps(duration: number, prefix: string): ScoreEvent[] {
  return makeRests(duration, prefix).map((event) => ({ ...event, gap: true }));
}

export function fullMeasureRest(meter: Meter, prefix: string): ScoreEvent[] {
  const duration = durationFromBeats(measureCapacity(meter));
  return [{ id: `${prefix}-r0`, pitch: null, duration, measureRest: true }];
}

/** Removes indications and repeats anchored to deleted notes or measures. */
export function detachFrom(draft: Draft, removedIds: string[]) {
  draft.annotations = draft.annotations.filter((a) => !removedIds.includes(a.targetId));
  draft.repeats = draft.repeats.filter(
    (r) => !removedIds.includes(r.startMeasureId) && !removedIds.includes(r.endMeasureId),
  );
}
