import { durationFromBeats, measureCapacity } from "../rhythm";
import type { Meter, Score, ScoreEvent } from "../schema";

/**
 * Operation handlers mutate a cloned draft of the score. `applyCommand` owns cloning,
 * revision checks and final validation, so a failed handler never leaks a partial edit.
 */
export type Draft = Score;

/** Deterministic, request-scoped prefix for IDs created by one operation. */
export type OperationContext = { idPrefix: string };

export function fullMeasureRest(meter: Meter, prefix: string): ScoreEvent[] {
  const duration = durationFromBeats(measureCapacity(meter));
  return [{ id: `${prefix}-r0`, pitch: null, duration, measureRest: true }];
}

/** Removes indications, repeats and chords anchored to deleted notes or measures. */
export function detachFrom(draft: Draft, removedIds: string[]) {
  draft.annotations = draft.annotations.filter((a) => !removedIds.includes(a.targetId));
  draft.chords = draft.chords.filter((c) => !removedIds.includes(c.measureId));
  draft.marks = draft.marks.filter((m) => !removedIds.includes(m.measureId));
  draft.repeats = draft.repeats.filter(
    (r) => !removedIds.includes(r.startMeasureId) && !removedIds.includes(r.endMeasureId),
  );
}
