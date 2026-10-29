import { getMeasure, getStaff } from "../queries";
import { durationFromBeats } from "../rhythm";
import {
  allStaves,
  barEvents,
  barStyle,
  createMeasure,
  measureEvents,
  primaryVoiceId,
  putVoiceBar,
  setBarStyle,
  voiceBars,
} from "../voice-access";
import { detachFrom, fullMeasureRest, restStaff, type Draft, type OperationContext } from "./draft";
import type { OperationOf } from "./schema";

/** Inserts an empty bar (full-measure rest) after the given bar, or at the end. */
export function appendMeasure(draft: Draft, op: OperationOf<"appendMeasure">, { idPrefix }: OperationContext) {
  const index = op.afterMeasureId
    ? draft.measures.indexOf(getMeasure(draft, op.afterMeasureId))
    : draft.measures.length - 1;
  const meter = { ...draft.measures[index].meter };
  // Every staff's main line gets a whole-bar rest; staves after the first take their own rest IDs.
  const bar = createMeasure(draft, { id: `${idPrefix}-bar`, meter }, (staff) =>
    fullMeasureRest(meter, staff === 0 ? idPrefix : `${idPrefix}-s${staff}`),
  );
  draft.measures.splice(index + 1, 0, bar);
}

export function deleteMeasure(draft: Draft, op: OperationOf<"deleteMeasure">) {
  const measure = getMeasure(draft, op.measureId);
  detachFrom(draft, [measure.id, ...measureEvents(measure).map((e) => e.id)]);
  draft.measures = draft.measures.filter((m) => m.id !== measure.id);
  // A repeat sign needs a bar before it.
  const first = draft.measures[0];
  if (first && barStyle(first) === "repeat") setBarStyle(first, undefined);
}

/**
 * Copies a bar with its indications and chords, giving every copy a fresh ID. Its section and
 * navigation marks stay on the original: they label one place in the form.
 */
export function duplicateMeasure(draft: Draft, op: OperationOf<"duplicateMeasure">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  const copy = structuredClone(measure);
  const copiedIds = new Map([[measure.id, `${idPrefix}-bar`]]);
  copy.id = `${idPrefix}-bar`;
  delete copy.section;
  // The primary voice's notes are -n0, -n1…; another voice k's are -vkn0, -vkn1….
  voiceBars(copy).forEach((voiceBar, k) => {
    voiceBar.events.forEach((event, index) => {
      const id = k === 0 ? `${idPrefix}-n${index}` : `${idPrefix}-v${k}n${index}`;
      copiedIds.set(event.id, id);
      event.id = id;
    });
  });
  const annotations = draft.annotations
    .filter((a) => copiedIds.has(a.targetId))
    .map((a, index) => ({ ...a, id: `${idPrefix}-a${index}`, targetId: copiedIds.get(a.targetId)! }));
  draft.annotations.push(...annotations);
  const chords = draft.chords
    .filter((c) => c.measureId === measure.id)
    .map((c, index) => ({ ...c, id: `${idPrefix}-c${index}`, measureId: copy.id }));
  draft.chords.push(...chords);
  draft.measures.splice(draft.measures.indexOf(measure) + 1, 0, copy);
}

/** Empties one staff of a bar, or every staff when none is named. */
export function clearMeasure(draft: Draft, op: OperationOf<"clearMeasure">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  const staves = op.staffId ? [getStaff(draft, op.staffId)] : allStaves(draft);
  staves.forEach((staff, index) => restStaff(draft, measure, staff, index === 0 ? idPrefix : `${idPrefix}-s${index}`));
}

/** Writes one line of a bar (the main line unless a voice is named), replacing what it held. */
export function replaceMeasure(draft: Draft, op: OperationOf<"replaceMeasure">, { idPrefix }: OperationContext) {
  const measure = getMeasure(draft, op.measureId);
  const voiceId = op.voiceId ?? primaryVoiceId(draft);
  detachFrom(
    draft,
    barEvents(measure, voiceId).map((e) => e.id),
  );
  const events = op.events.map((event, index) => ({
    id: `${idPrefix}-n${index}`,
    pitch: event.pitch,
    duration: durationFromBeats(event.duration),
    ...(event.tie && event.pitch ? { tie: true as const } : {}),
  }));
  putVoiceBar(draft, measure, voiceId, events);
  setBarStyle(measure, undefined, voiceId);
}

/** Layout-only override; never changes musical timing. `null` restores default spacing. */
export function setMeasureWidth(draft: Draft, op: OperationOf<"setMeasureWidth">) {
  const measure = getMeasure(draft, op.measureId);
  if (op.width === null) delete measure.width;
  else measure.width = op.width;
}
