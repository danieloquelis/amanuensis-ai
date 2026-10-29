import { durationFromBeats, measureCapacity } from "../rhythm";
import type { Measure, Meter, Score, ScoreEvent, Staff } from "../schema";
import { removeVoiceBar, setBarEvents, setBarStyle, voiceBars } from "../voice-access";

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

/**
 * Empties one staff of a bar: its main line becomes a whole-bar rest shown as notes, its other
 * voices leave the bar, and indications on the removed notes go with them.
 */
export function restStaff(draft: Draft, measure: Measure, staff: Staff, idPrefix: string) {
  const voiceIds = new Set(staff.voices.map((voice) => voice.id));
  const removed = voiceBars(measure).filter((bar) => voiceIds.has(bar.voiceId));
  detachFrom(
    draft,
    removed.flatMap((bar) => bar.events.map((e) => e.id)),
  );
  const main = staff.voices[0].id;
  for (const bar of removed) if (bar.voiceId !== main) removeVoiceBar(measure, bar.voiceId);
  setBarEvents(measure, fullMeasureRest(measure.meter, idPrefix), main);
  setBarStyle(measure, undefined, main);
}
